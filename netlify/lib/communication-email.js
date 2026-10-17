import { fail } from './account-contract.js';

const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
// Server-owned markup only. The controlled editor never accepts HTML, style,
// destinations, scripts or provider expressions. Meaning survives blocked images.
export function communicationEmail(render,{origin,route}) {
  let site;try{site=new URL(origin);}catch{fail('communication-origin-unavailable',503);}
  if(site.origin!==origin||site.protocol!=='https:'&&!(site.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(site.hostname)))fail('communication-origin-unavailable',503);
  if(typeof route!=='string'||!/^\/(?!\/)/.test(route)||/[\\\r\n]/.test(route))fail('communication-destination-denied',409);
  const destination=new URL(route,site);if(destination.origin!==site.origin)fail('communication-destination-denied',409);
  const plainText=['UNIVERSAL DICTA COUTURE',render.greeting,render.heading,render.body,`${render.ctaLabel}: ${destination.href}`,render.support,'Sign in to view current details.'].filter(Boolean).join('\n\n');
  const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><title>${escape(render.subject)}</title></head><body style="margin:0;background:#f7f3ef;color:#241b1b;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(render.preheader)}</div><main style="max-width:600px;margin:0 auto;padding:24px;background:#fff"><header style="padding-bottom:20px;border-bottom:1px solid #e7dcd5;color:#650d25"><p>UNIVERSAL DICTA COUTURE</p></header>${render.greeting?`<p>${escape(render.greeting)}</p>`:''}<h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.3">${escape(render.heading)}</h1><p style="white-space:pre-wrap;line-height:1.6;overflow-wrap:anywhere">${escape(render.body)}</p><p><a href="${escape(destination.href)}" style="display:inline-block;padding:14px 20px;background:#650d25;color:#fff;text-decoration:none;border-radius:4px">${escape(render.ctaLabel)}</a></p><p style="line-height:1.6">${escape(render.support)}</p><footer style="margin-top:24px;padding-top:16px;border-top:1px solid #e7dcd5"><p>Sign in to view current details.</p><p>Universal Dicta Couture</p></footer></main></body></html>`;
  return{subject:render.subject,preheader:render.preheader,html,plainText};
}
