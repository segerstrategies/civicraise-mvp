'use client';

import { FormEvent, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

type Entry = { id: string; type: 'question' | 'note'; page: string; text: string; createdAt: string };
const HISTORY_KEY = 'civicraise-guide-history-v1';
const RECIPIENT = 'william.lockhart@gmail.com';
const pageNames: Record<string, string> = { '/': 'Home', '/campaigns': 'Campaigns', '/dashboard': 'Dashboard', '/profile': 'Profile', '/onboarding': 'Onboarding', '/legislation': 'Legislation', '/ratification': 'Ratification', '/advocate/dashboard': 'Advocate dashboard', '/admin': 'Operations console' };

function pageName(pathname: string) {
  if (pageNames[pathname]) return pageNames[pathname];
  if (pathname.startsWith('/campaigns/')) return 'Campaign details';
  if (pathname.startsWith('/advocate/')) return 'Advocate workspace';
  return 'CivicRaise';
}

function guideReply(question: string, page: string) {
  const lower = question.toLowerCase();
  if (lower.includes('pledge') || lower.includes('pay') || lower.includes('money')) return 'This MVP uses test pledges only. You can explore campaign support without a real charge while CivicRaise validates payment and compliance architecture.';
  if (lower.includes('campaign') || lower.includes('start')) return 'Campaigns organize people around a defined policy goal. Explore the campaign brief, planned work, and progress updates before you make a test pledge.';
  if (lower.includes('advocate') || lower.includes('rfp') || lower.includes('bid')) return 'Advocates review RFPs, submit bids, and report progress after a contract becomes active. Visit the Advocate area to see that workflow.';
  if (lower.includes('ratif') || lower.includes('vote') || lower.includes('review')) return 'Ratification lets eligible backers review completed work. When a campaign has an open ballot, you can read the deliverables and record your review.';
  return `You are viewing ${page}. I can explain campaigns, test pledges, advocates, RFPs, deliverables, and ratification.`;
}

export default function CivicRaiseGuide() {
  const pathname = usePathname();
  const page = pageName(pathname);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'ask' | 'note'>('ask');
  const [value, setValue] = useState('');
  const [reply, setReply] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accountEmail, setAccountEmail] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    try { setEntries(JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]')); } catch { setEntries([]); }
    const client = createClient();
    if (client) void client.auth.getUser().then(({ data }) => setAccountEmail(data.user?.email || ''));
  }, []);

  function persist(next: Entry[]) {
    setEntries(next);
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Local history is optional. */ }
  }

  async function emailEntry(entry: Entry) {
    try {
      const response = await fetch('/api/guide-entry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      const result = await response.json().catch(() => ({}));
      return response.ok ? 'Sent to William Lockhart.' : (result.message || 'Saved locally. Email delivery is unavailable.');
    } catch { return 'Saved locally. Email delivery is unavailable.'; }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    const entry: Entry = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, type: mode === 'ask' ? 'question' : 'note', page, text, createdAt: new Date().toISOString() };
    persist([entry, ...entries]);
    setValue('');
    setReply(mode === 'ask' ? guideReply(text, page) : 'Note saved.');
    const delivery = await emailEntry(entry);
    setReply((current) => `${current} ${delivery}`);
  }

  const pageEntries = entries.filter((entry) => entry.page === page);
  return <aside className="civic-guide" aria-label="CivicRaise Guide">
    {open && <div className="civic-guide-panel">
      <div className="civic-guide-heading"><div><p className="civic-guide-kicker">CIVICRAISE GUIDE</p><h2>Questions and notes</h2></div><button className="civic-guide-close" type="button" onClick={() => setOpen(false)} aria-label="Close CivicRaise Guide">×</button></div>
      <p className="civic-guide-context">Viewing <strong>{page}</strong> · Signed in as <strong>{accountEmail || 'not signed in'}</strong></p>
      <div className="civic-guide-tabs" role="tablist" aria-label="Guide mode"><button type="button" role="tab" aria-selected={mode === 'ask'} className={mode === 'ask' ? 'active' : ''} onClick={() => setMode('ask')}>Ask CivicRaise</button><button type="button" role="tab" aria-selected={mode === 'note'} className={mode === 'note' ? 'active' : ''} onClick={() => setMode('note')}>Save a note</button></div>
      <form onSubmit={submit} className="civic-guide-form"><label htmlFor="civic-guide-input">{mode === 'ask' ? 'What would you like to know?' : 'What would you like to remember?'}</label><textarea id="civic-guide-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === 'ask' ? 'For example, how does ratification work?' : `Add a note about ${page}`} rows={3}/><button className="btn primary" type="submit">{mode === 'ask' ? 'Ask and send' : 'Save and send'}</button></form>
      {reply && <p className="civic-guide-reply" role="status">{reply}</p>}
      <button type="button" className="civic-guide-notes-toggle" onClick={() => setShowHistory((current) => !current)}>{showHistory ? 'Hide' : 'View'} page history ({pageEntries.length})</button>
      {showHistory && <div className="civic-guide-notes">{pageEntries.length === 0 ? <p className="muted">No entries on this page yet.</p> : pageEntries.map((entry) => <div className="civic-guide-note" key={entry.id}><p><strong>{entry.type === 'note' ? 'Note' : 'Question'}:</strong> {entry.text}</p><span>{new Date(entry.createdAt).toLocaleString()}</span></div>)}</div>}
      <p className="civic-guide-disclosure">Each submitted note or question is also sent to {RECIPIENT}. The browser keeps a local history for this demo.</p>
    </div>}
    <button className="civic-guide-launcher" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{open ? 'Close guide' : 'Ask CivicRaise'}</button>
  </aside>;
}
