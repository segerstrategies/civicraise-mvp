'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

type Update = { id: string; title: string; body: string; update_type: string; published_at: string; milestone_id: string | null; campaign_milestones?: { name: string } | null };
type Event = { id: string; title: string; description: string; starts_at: string; ends_at: string | null; location: string; event_url: string | null };
const updateLabels: Record<string, string> = { PROGRESS: 'Progress', MILESTONE: 'Milestone', OUTCOME: 'Outcome', NOTICE: 'Notice' };

function toLocalInput(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 7 * 86400000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function CampaignUpdatesPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [myRsvps, setMyRsvps] = useState<string[]>([]);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('PROGRESS');
  const [milestoneId, setMilestoneId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventStart, setEventStart] = useState(toLocalInput());
  const [eventLocation, setEventLocation] = useState('');
  const [eventUrl, setEventUrl] = useState('');

  const load = useCallback(async () => {
    const sb = createClient();
    if (!sb) { setMessage('Supabase is not configured.'); setLoading(false); return; }
    setLoading(true);
    const [{ data: auth }, { data: bySlug, error: campaignError }] = await Promise.all([
      sb.auth.getUser(),
      sb.from('campaigns').select('id,slug,title,bill,status,campaign_milestones(id,name,sequence)').eq('slug', id).maybeSingle(),
    ]);
    let found = bySlug;
    if (!found && /^[0-9a-f-]{36}$/i.test(id)) {
      const { data } = await sb.from('campaigns').select('id,slug,title,bill,status,campaign_milestones(id,name,sequence)').eq('id', id).maybeSingle();
      found = data;
    }
    if (campaignError || !found) { setMessage(campaignError?.message || 'Campaign not found.'); setLoading(false); return; }
    setCampaign(found);
    const currentUser = auth.user;
    setUser(currentUser);
    let admin = false;
    if (currentUser) {
      const { data: profile } = await sb.from('profiles').select('role').eq('id', currentUser.id).maybeSingle();
      admin = profile?.role === 'admin';
    }
    setIsAdmin(admin);

    const [{ data: updateRows }, { data: eventRows }] = await Promise.all([
      sb.from('campaign_updates').select('id,title,body,update_type,published_at,milestone_id,campaign_milestones(name)').eq('campaign_id', found.id).order('published_at', { ascending: false }),
      sb.from('campaign_events').select('id,title,description,starts_at,ends_at,location,event_url').eq('campaign_id', found.id).order('starts_at', { ascending: true }),
    ]);
    const loadedUpdates = (updateRows || []).map((row: any) => ({
      ...row,
      campaign_milestones: Array.isArray(row.campaign_milestones)
        ? row.campaign_milestones[0] || null
        : row.campaign_milestones || null,
    })) as Update[];
    const loadedEvents = (eventRows || []) as Event[];
    setUpdates(loadedUpdates);
    setEvents(loadedEvents);
    if (loadedEvents.length) {
      const { data: counts } = await sb.rpc('get_campaign_event_rsvp_counts', { p_event_ids: loadedEvents.map((event) => event.id) });
      setEventCounts(Object.fromEntries((counts || []).map((row: any) => [row.event_id, Number(row.attendee_count || 0)])));
      if (currentUser) {
        const { data: rows } = await sb.from('campaign_event_rsvps').select('event_id').eq('user_id', currentUser.id).in('event_id', loadedEvents.map((event) => event.id));
        setMyRsvps((rows || []).map((row: any) => row.event_id));
      } else setMyRsvps([]);
    } else { setEventCounts({}); setMyRsvps([]); }
    if (currentUser) {
      const [{ data: follow }, { data: read }, { data: count }] = await Promise.all([
        sb.from('campaign_follows').select('campaign_id').eq('campaign_id', found.id).eq('user_id', currentUser.id).maybeSingle(),
        sb.from('campaign_update_reads').select('last_read_at').eq('campaign_id', found.id).eq('user_id', currentUser.id).maybeSingle(),
        sb.rpc('get_campaign_follower_count', { p_campaign_id: found.id }),
      ]);
      setFollowing(Boolean(follow));
      setFollowerCount(Number(count || 0));
      const lastRead = read?.last_read_at ? new Date(read.last_read_at).getTime() : 0;
      setUnread(loadedUpdates.filter((row) => new Date(row.published_at).getTime() > lastRead).length);
      await sb.from('campaign_update_reads').upsert({ campaign_id: found.id, user_id: currentUser.id, last_read_at: new Date().toISOString() });
    } else { setFollowing(false); setFollowerCount(null); setUnread(0); }
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const visibleUpdates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return updates.filter((row) => (filter === 'ALL' || row.update_type === filter) && (!needle || `${row.title} ${row.body}`.toLowerCase().includes(needle)))
      .sort((a, b) => sort === 'newest' ? Date.parse(b.published_at) - Date.parse(a.published_at) : Date.parse(a.published_at) - Date.parse(b.published_at));
  }, [updates, filter, sort, query]);

  async function toggleFollow() {
    const sb = createClient(); if (!sb || !user) return;
    setSaving(true); setMessage('');
    const result = following
      ? await sb.from('campaign_follows').delete().eq('campaign_id', campaign.id).eq('user_id', user.id)
      : await sb.from('campaign_follows').insert({ campaign_id: campaign.id, user_id: user.id });
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setFollowing(!following); setFollowerCount((count) => Math.max(0, (count ?? 0) + (following ? -1 : 1)));
    setMessage(following ? 'You unfollowed this campaign.' : 'You are following campaign updates.');
  }

  async function postUpdate(event: React.FormEvent) {
    event.preventDefault(); const sb = createClient(); if (!sb || !campaign || !user) return;
    setSaving(true); setMessage('');
    const { error } = await sb.from('campaign_updates').insert({ campaign_id: campaign.id, author_id: user.id, title: title.trim(), body: body.trim(), update_type: type, milestone_id: milestoneId || null });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setTitle(''); setBody(''); setMilestoneId(''); setMessage('Campaign update published.'); await load();
  }

  async function postEvent(event: React.FormEvent) {
    event.preventDefault(); const sb = createClient(); if (!sb || !campaign || !user) return;
    setSaving(true); setMessage('');
    const { error } = await sb.from('campaign_events').insert({ campaign_id: campaign.id, created_by: user.id, title: eventTitle.trim(), description: eventDescription.trim(), starts_at: new Date(eventStart).toISOString(), location: eventLocation.trim(), event_url: eventUrl.trim() || null });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setEventTitle(''); setEventDescription(''); setEventLocation(''); setEventUrl(''); setEventStart(toLocalInput()); setMessage('Event published.'); await load();
  }

  async function toggleRsvp(eventId: string) {
    const sb = createClient(); if (!sb || !user) return;
    const attending = myRsvps.includes(eventId); setSaving(true);
    const result = attending
      ? await sb.from('campaign_event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id)
      : await sb.from('campaign_event_rsvps').insert({ event_id: eventId, user_id: user.id });
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    setMyRsvps((rows) => attending ? rows.filter((value) => value !== eventId) : [...rows, eventId]);
    setEventCounts((counts) => ({ ...counts, [eventId]: Math.max(0, (counts[eventId] || 0) + (attending ? -1 : 1)) }));
    setMessage(attending ? 'Your RSVP was cancelled.' : 'You are on the attendee list.');
  }

  async function shareUpdate(update: Update) {
    const url = `${window.location.origin}${window.location.pathname}#update-${update.id}`;
    try { if (navigator.share) await navigator.share({ title: update.title, url }); else await navigator.clipboard.writeText(url); setMessage('Update link shared or copied.'); }
    catch { setMessage(`Update link: ${url}`); }
  }

  function downloadCalendar(event: Event) {
    const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CivicRaise//Campaign Events//EN','BEGIN:VEVENT',`UID:${event.id}@civicraise`,`DTSTAMP:${stamp(new Date().toISOString())}`,`DTSTART:${stamp(event.starts_at)}`,...(event.ends_at ? [`DTEND:${stamp(event.ends_at)}`] : []),`SUMMARY:${event.title.replace(/[\\,;]/g, '\\$&')}`,`DESCRIPTION:${event.description.replace(/[\\,;]/g, '\\$&')}`,`LOCATION:${event.location.replace(/[\\,;]/g, '\\$&')}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' })); link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`; link.click(); URL.revokeObjectURL(link.href);
  }

  if (loading) return <><div className="eyebrow">CAMPAIGN COMMUNITY</div><h1>Loading updates…</h1></>;
  if (!campaign) return <><div className="eyebrow">CAMPAIGN COMMUNITY</div><h1>Campaign updates unavailable</h1><p className="notice">{message}</p><Link className="btn" href="/campaigns">Browse campaigns</Link></>;
  const milestones = [...(campaign.campaign_milestones || [])].sort((a: any, b: any) => a.sequence - b.sequence);

  return <>
    <div className="eyebrow">{campaign.bill || 'CAMPAIGN'} · {campaign.status}</div>
    <h1>{campaign.title}</h1>
    <p className="muted">Supporter updates, community events, and ways to stay involved.</p>
    <div className="actions"><Link className="btn" href={`/campaigns/${campaign.slug || campaign.id}`}>Campaign overview</Link><button className="btn primary" onClick={() => void toggleFollow()} disabled={!user || saving}>{following ? 'Following · unfollow' : 'Follow updates'}{followerCount !== null ? ` (${followerCount})` : ''}</button>{!user && <Link className="btn" href="/auth">Sign in to follow and RSVP</Link>}</div>
    {message && <div className="notice" role="status">{message}</div>}
    {unread > 0 && <p className="muted" aria-live="polite">{unread} new update{unread === 1 ? '' : 's'} since your last visit. Your read marker is now up to date.</p>}

    {isAdmin && <div className="grid two" style={{ marginTop: 18 }}>
      <form className="card form" onSubmit={postUpdate}>
        <h2>Publish campaign update</h2>
        <label>Title<input required minLength={3} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Update type<select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(updateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Related milestone<select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}><option value="">No milestone</option>{milestones.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Message<textarea required minLength={1} maxLength={5000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} /><span className="form-help">{body.length}/5000 characters</span></label>
        <button className="btn primary" disabled={saving}>{saving ? 'Publishing…' : 'Publish update'}</button>
      </form>
      <form className="card form" onSubmit={postEvent}>
        <h2>Add community event</h2>
        <label>Event name<input required minLength={3} maxLength={160} value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} /></label>
        <label>Start date and time<input required type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} /></label>
        <label>Location<input maxLength={240} value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Online or venue" /></label>
        <label>Registration link (optional)<input type="url" pattern="https://.*" value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="https://…" /></label>
        <label>Details<textarea maxLength={3000} rows={3} value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} /></label>
        <button className="btn primary" disabled={saving}>{saving ? 'Publishing…' : 'Publish event'}</button>
      </form>
    </div>}

    <div className="card" style={{ marginTop: 18 }}>
      <div className="actions" style={{ marginTop: 0, alignItems: 'end' }}>
        <label>Update type<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">All updates</option>{Object.entries(updateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Find in updates<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title and message" /></label>
        <label>Order<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        <span className="muted">{visibleUpdates.length} update{visibleUpdates.length === 1 ? '' : 's'} · {unread} new on last visit</span>
      </div>
      <h2>Campaign updates</h2>
      {visibleUpdates.length === 0 ? <p className="muted">No updates match these filters. Follow the campaign to keep this page on your list.</p> : <div className="update-list">{visibleUpdates.map((update) => <article id={`update-${update.id}`} key={update.id} className="card update-item">
        <div className="eyebrow">{updateLabels[update.update_type] || update.update_type} · {new Date(update.published_at).toLocaleString()}</div>
        <h3>{update.title}</h3>{update.campaign_milestones?.name && <p className="muted">Milestone: {update.campaign_milestones.name}</p>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{update.body}</p><button className="link-button" onClick={() => void shareUpdate(update)}>Share this update</button>
      </article>)}</div>}
    </div>

    <div className="card" style={{ marginTop: 18 }}>
      <h2>Community events</h2>
      {events.length === 0 ? <p className="muted">No community events are scheduled yet.</p> : <div className="grid two">{events.map((event) => <article className="card" key={event.id}>
        <div className="eyebrow">{new Date(event.starts_at).toLocaleString()}</div><h3>{event.title}</h3><p>{event.description || 'Join the campaign community.'}</p><p className="muted">{event.location || 'Location to be announced'} · {eventCounts[event.id] || 0} attending</p>
        <div className="actions"><button className="btn primary" disabled={!user || saving || Date.parse(event.starts_at) < Date.now()} onClick={() => void toggleRsvp(event.id)}>{myRsvps.includes(event.id) ? 'Cancel RSVP' : 'RSVP'}</button><button className="btn" onClick={() => downloadCalendar(event)}>Add to calendar</button>{event.event_url && <a className="btn" href={event.event_url} target="_blank" rel="noreferrer">Event details</a>}</div>
      </article>)}</div>}
    </div>
    <p className="muted" style={{ marginTop: 18 }}>Following is an in-app preference. CivicRaise does not send email or contact officials from this page.</p>
  </>;
}
