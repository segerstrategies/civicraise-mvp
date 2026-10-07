import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
export async function POST(req:Request){
 const sb=await createClient();if(!sb)return NextResponse.json({message:'Supabase is not configured.'},{status:503});const {data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({message:'Sign in required.'},{status:401});const {data:me}=await sb.from('profiles').select('role').eq('id',user.id).maybeSingle();if(me?.role!=='admin')return NextResponse.json({message:'Admin access required.'},{status:403});
 const {advocateId,status}=await req.json().catch(()=>({}));if(!advocateId||!['verified','rejected','pending'].includes(status))return NextResponse.json({message:'Advocate and valid status are required.'},{status:400});
 const {error}=await sb.from('advocate_profiles').update({verification_status:status}).eq('id',advocateId);if(error)return NextResponse.json({message:error.message},{status:400});
 await sb.rpc('log_audit',{p_event:'ADVOCATE_VERIFICATION_CHANGED',p_entity_type:'advocate',p_entity_id:advocateId,p_payload:{status}});
 return NextResponse.json({message:`Advocate marked ${status}.`});
}
