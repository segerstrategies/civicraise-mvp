'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
export default function DisputesAdmin() {
  const [rows, setRows] = useState<any[]>([]); const [msg, setMsg] = useState('');
  async function load(){ const sb=createClient(); if(!sb)return; const {data}=await sb.from('disputes').select('*,profiles(full_name),deliverables(id,description)').order('created_at',{ascending:false}); setRows(data||[]); }
  useEffect(()=>{load()},[]);
  async function resolve(id:string,resolution:string){const r=await fetch('/api/admin/dispute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({disputeId:id,resolution})});const j=await r.json();setMsg(j.message);load();}
  return <><div className="eyebrow">ADMIN · DISPUTES</div><h1>Dispute queue</h1>{msg&&<div className="notice">{msg}</div>}<div className="card"><table><thead><tr><th>Raised by</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(d=><tr key={d.id}><td>{d.profiles?.full_name||d.raised_by}</td><td>{d.reason}</td><td>{d.status}</td><td>{d.status==='OPEN'&&<div className="actions"><button className="btn" onClick={()=>resolve(d.id,'CURED')}>Cure / accept</button><button className="btn" onClick={()=>resolve(d.id,'UPHELD')}>Require cure</button></div>}</td></tr>)}</tbody></table>{rows.length===0&&<p className="muted">No disputes.</p>}</div></>;
}
