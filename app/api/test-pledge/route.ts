import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase-server';
export async function POST(req:Request){
 const body=await req.json().catch(()=>({})); const amount=Number(body.amount); const campaignId=String(body.campaignId||'');
 if(!campaignId||!Number.isFinite(amount)||amount<0.99)return NextResponse.json({message:'Enter a valid test pledge.'},{status:400});
 const sb=await createClient();if(!sb)return NextResponse.json({message:'Supabase is not configured.'},{status:503});
 const {data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({message:'Sign in before making a pledge.'},{status:401});
 
 const cents=Math.round(amount*100); const {data,error}=await sb.rpc('record_test_pledge',{p_campaign_id:campaignId,p_user_id:user.id,p_amount_cents:cents,p_reference:`TEST-${Date.now()}`});
 if(error)return NextResponse.json({message:error.message},{status:400});
 return NextResponse.json({message:`Pledge of $${amount.toFixed(2)} recorded.`,campaign:data});
}
