import {NextResponse} from 'next/server'; import {createClient} from '@/lib/supabase-server';
export async function POST(req:Request){
 const sb=await createClient();if(!sb)return NextResponse.json({message:'Supabase is not configured.'},{status:503});
 const {data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({message:'Sign in required.'},{status:401});
 const {data:me}=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();if(me?.role!=='admin')return NextResponse.json({message:'Admin access required.'},{status:403});
 const {ballotId}=await req.json().catch(()=>({}));if(!ballotId)return NextResponse.json({message:'Ballot is required.'},{status:400});
 const {data:b,error:be}=await sb.from('ratification_ballots').select('*').eq('id',ballotId).single();if(be||!b)return NextResponse.json({message:'Ballot not found.'},{status:404});if(b.status!=='OPEN')return NextResponse.json({message:`Ballot is already ${b.status}.`},{status:409});
 const {data:pledges,error:pe}=await sb.from('pledges').select('amount_cents').eq('campaign_id',b.campaign_id);if(pe)return NextResponse.json({message:pe.message},{status:400});
 const {data:votes,error:ve}=await sb.from('ratification_votes').select('pledged_cents,approve').eq('ballot_id',ballotId);if(ve)return NextResponse.json({message:ve.message},{status:400});
 const totalPledged=(pledges||[]).reduce((n,v)=>n+Number(v.amount_cents),0);const participating=(votes||[]).reduce((n,v)=>n+Number(v.pledged_cents),0);const yes=(votes||[]).filter(v=>v.approve).reduce((n,v)=>n+Number(v.pledged_cents),0);const no=(votes||[]).filter(v=>!v.approve).reduce((n,v)=>n+Number(v.pledged_cents),0);
 const quorumMet=totalPledged>0&&participating>=totalPledged*(Number(b.quorum_percent)/100);const approvalMet=participating>0&&yes/participating>=Number(b.approval_percent)/100;const approved=quorumMet&&approvalMet;const status=approved?'RATIFIED':'REJECTED';
 await sb.from('ratification_ballots').update({status}).eq('id',ballotId);await sb.from('campaigns').update({status:approved?'DISBURSEMENT_PENDING':'DISPUTED'}).eq('id',b.campaign_id);
 await sb.from('ledger_entries').insert({campaign_id:b.campaign_id,entry_type:approved?'RATIFICATION_APPROVED':'RATIFICATION_REJECTED',amount_cents:0,reference_type:'ratification_ballot',reference_id:ballotId});
 await sb.rpc('log_audit',{p_event:'RATIFICATION_FINALIZED',p_entity_type:'ballot',p_entity_id:ballotId,p_payload:{totalPledged,participating,yes,no,quorumMet,approvalMet,approved}});
 return NextResponse.json({message:`Ballot finalized: ${status}.`,totalPledged,participating,yes,no,quorumMet,approvalMet});
}
