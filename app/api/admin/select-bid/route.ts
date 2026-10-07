import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase-server';
export async function POST(req:Request){
 const sb=await createClient(); if(!sb)return NextResponse.json({message:'Supabase is not configured.'},{status:503});
 const {data:{user}}=await sb.auth.getUser(); if(!user)return NextResponse.json({message:'Sign in required.'},{status:401});
 const {data:me}=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle(); if(me?.role!=='admin')return NextResponse.json({message:'Admin access required.'},{status:403});
 const {bidId}=await req.json().catch(()=>({})); if(!bidId)return NextResponse.json({message:'Bid is required.'},{status:400});
 const {data:bid,error}=await sb.from('bids').select('*,rfps(*)').eq('id',bidId).single(); if(error||!bid)return NextResponse.json({message:error?.message||'Bid not found.'},{status:404});
 if(bid.status!=='SUBMITTED')return NextResponse.json({message:'Only submitted bids can be selected.'},{status:409});
 if(bid.rfps?.status!=='OPEN')return NextResponse.json({message:'The RFP is not open for award.'},{status:409});
 const {data:adv}=await sb.from('advocate_profiles').select('verification_status').eq('id',bid.advocate_id).maybeSingle(); if(adv?.verification_status!=='verified')return NextResponse.json({message:'Advocate must be verified before award.'},{status:409});
 await sb.from('bids').update({status:'SELECTED'}).eq('id',bidId);
 await sb.from('bids').update({status:'REJECTED'}).eq('rfp_id',bid.rfp_id).neq('id',bidId);
 const {data:contract,error:ce}=await sb.from('contracts').insert({rfp_id:bid.rfp_id,advocate_id:bid.advocate_id,status:'ACTIVE'}).select().single(); if(ce)return NextResponse.json({message:ce.message},{status:400});
 await sb.from('rfps').update({status:'AWARDED'}).eq('id',bid.rfp_id);
 await sb.from('campaigns').update({status:'CONTRACT_ACTIVE'}).eq('id',bid.rfps.campaign_id);
 await sb.rpc('log_audit',{p_event:'BID_SELECTED',p_entity_type:'bid',p_entity_id:bidId,p_payload:{contract_id:contract.id}});
 return NextResponse.json({message:'Bid selected and test contract created.',contractId:contract.id});
}
