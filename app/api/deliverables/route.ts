import {NextResponse} from 'next/server'; import {createClient} from '@/lib/supabase-server';
export async function POST(req:Request){
 const sb=await createClient();if(!sb)return NextResponse.json({message:'Supabase is not configured.'},{status:503});const {data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({message:'Sign in required.'},{status:401});
 const {contractId,milestoneId,description}=await req.json().catch(()=>({}));if(!contractId||!milestoneId||!String(description||'').trim())return NextResponse.json({message:'Contract, milestone and description are required.'},{status:400});
 const {data:c}=await sb.from('contracts').select('*,rfps(campaign_id,status)').eq('id',contractId).eq('advocate_id',user.id).maybeSingle();if(!c)return NextResponse.json({message:'Contract not found for this advocate.'},{status:403});
 if(!['ACTIVE','IN_PROGRESS'].includes(c.status))return NextResponse.json({message:'Contract is not accepting deliverables.'},{status:409});
 const campaignId=(c.rfps as any)?.campaign_id;if(!campaignId)return NextResponse.json({message:'Contract campaign could not be resolved.'},{status:400});
 const {data:m}=await sb.from('campaign_milestones').select('id,campaign_id').eq('id',milestoneId).eq('campaign_id',campaignId).maybeSingle();if(!m)return NextResponse.json({message:'Milestone does not belong to this campaign.'},{status:400});
 const {data:existing}=await sb.from('deliverables').select('id').eq('contract_id',contractId).eq('milestone_id',milestoneId).in('status',['SUBMITTED','ACCEPTED']).maybeSingle();if(existing)return NextResponse.json({message:'A deliverable already exists for this milestone.'},{status:409});
 const {data,error}=await sb.from('deliverables').insert({contract_id:contractId,milestone_id:milestoneId,description:String(description).trim(),status:'SUBMITTED'}).select().single();if(error)return NextResponse.json({message:error.message},{status:400});
 await sb.from('campaigns').update({status:'BACKER_REVIEW'}).eq('id',campaignId);const {data:ballot}=await sb.from('ratification_ballots').select('id').eq('campaign_id',campaignId).eq('status','OPEN').maybeSingle();if(!ballot)await sb.from('ratification_ballots').insert({campaign_id:campaignId,deliverable_id:data.id,status:'OPEN',quorum_percent:60,approval_percent:85});
 await sb.rpc('log_audit',{p_event:'DELIVERABLE_SUBMITTED',p_entity_type:'deliverable',p_entity_id:data.id,p_payload:{contract_id:contractId,milestone_id:milestoneId}});return NextResponse.json({message:'Deliverable submitted and backer review opened.',deliverableId:data.id});
}
