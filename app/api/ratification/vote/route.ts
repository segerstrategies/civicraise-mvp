import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase-server';
export async function POST(req: Request) {
 const sb=await createClient(); if(!sb)return NextResponse.json({message:'Supabase is not configured.'},{status:503});
 const {data:{user}}=await sb.auth.getUser(); if(!user)return NextResponse.json({message:'Sign in required.'},{status:401});
 const {ballotId,approve}=await req.json().catch(()=>({})); if(!ballotId||typeof approve!=='boolean')return NextResponse.json({message:'Ballot and vote are required.'},{status:400});
 const {data:ballot,error:be}=await sb.from('ratification_ballots').select('id,campaign_id,status,deliverable_id').eq('id',ballotId).single(); if(be||!ballot)return NextResponse.json({message:'Ballot not found.'},{status:404});
 if(ballot.status!=='OPEN')return NextResponse.json({message:'This ballot is closed.'},{status:409});
 if(ballot.deliverable_id){const {data:d}=await sb.from('deliverables').select('status').eq('id',ballot.deliverable_id).maybeSingle();if(d?.status==='DISPUTED')return NextResponse.json({message:'Voting is paused while this deliverable is under dispute.'},{status:409});}
 const {data:pledges,error:pe}=await sb.from('pledges').select('amount_cents').eq('campaign_id',ballot.campaign_id).eq('user_id',user.id); if(pe)return NextResponse.json({message:pe.message},{status:400});
 const pledgedCents=(pledges||[]).reduce((sum,p)=>sum+Number(p.amount_cents),0); if(pledgedCents<=0)return NextResponse.json({message:'Only campaign backers can ratify this deliverable.'},{status:403});
 const {error}=await sb.from('ratification_votes').upsert({ballot_id:ballotId,user_id:user.id,pledged_cents:pledgedCents,approve},{onConflict:'ballot_id,user_id'}); if(error)return NextResponse.json({message:error.message},{status:400});
 return NextResponse.json({message:'Vote recorded.',pledgedCents});
}
