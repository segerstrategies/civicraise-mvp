import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
const allowed: Record<string,string[]> = {
  DRAFT:['UNDER_REVIEW'], UNDER_REVIEW:['PUBLISHED'], PUBLISHED:['FUNDING'], FUNDING:['FUNDED'], FUNDED:['RFP_OPEN'], RFP_OPEN:['BID_REVIEW','RFP_CLOSED'], BID_REVIEW:['ADVOCATE_SELECTED','RFP_CLOSED'], ADVOCATE_SELECTED:['CONTRACT_ACTIVE'], CONTRACT_ACTIVE:['MILESTONE_ACTIVE'], MILESTONE_ACTIVE:['DELIVERABLE_SUBMITTED','BACKER_REVIEW'], DELIVERABLE_SUBMITTED:['TECHNICAL_REVIEW'], TECHNICAL_REVIEW:['BACKER_REVIEW','CURE_REQUIRED'], BACKER_REVIEW:['RATIFIED','DISPUTED'], RATIFIED:['DISBURSEMENT_PENDING'], DISBURSEMENT_PENDING:['DISBURSED'], DISBURSED:['COMPLETED'], CURE_REQUIRED:['MILESTONE_ACTIVE','BACKER_REVIEW'], DISPUTED:['RESOLVED','CURE_REQUIRED'], RESOLVED:['BACKER_REVIEW']
};
export async function POST(req:Request){
 const sb=await createClient(); if(!sb)return NextResponse.json({message:'Supabase is not configured.'},{status:503});
 const {data:{user}}=await sb.auth.getUser(); if(!user)return NextResponse.json({message:'Sign in required.'},{status:401});
 const {data:me}=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle(); if(me?.role!=='admin')return NextResponse.json({message:'Admin access required.'},{status:403});
 const {campaignId,status}=await req.json().catch(()=>({})); if(!campaignId||!status)return NextResponse.json({message:'Campaign and status are required.'},{status:400});
 const {data:campaign,error:ce}=await sb.from('campaigns').select('status').eq('id',campaignId).single(); if(ce||!campaign)return NextResponse.json({message:'Campaign not found.'},{status:404});
 if(!allowed[campaign.status]?.includes(status))return NextResponse.json({message:`Invalid transition from ${campaign.status} to ${status}.`},{status:409});
 const {error}=await sb.from('campaigns').update({status}).eq('id',campaignId); if(error)return NextResponse.json({message:error.message},{status:400});
 await sb.rpc('log_audit',{p_event:'CAMPAIGN_STATUS_CHANGED',p_entity_type:'campaign',p_entity_id:campaignId,p_payload:{from:campaign.status,to:status}});
 return NextResponse.json({message:`Campaign advanced to ${status}.`});
}
