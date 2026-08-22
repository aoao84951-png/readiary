import { NextRequest, NextResponse } from 'next/server';

type SearchBook = { title:string; author:string; cover:string; url:string; totalCount:number; category:string; platform:string };
const category = (text:string) => /BL|비엘/i.test(text) ? 'BL' : /로맨스판타지|로판/i.test(text) ? '로맨스판타지' : /로맨스/i.test(text) ? '로맨스' : '문학';

async function ridi(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://ridibooks.com/apps/search/search?keyword=${encodeURIComponent(q)}&adult_exclude=n`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json',Referer:'https://ridibooks.com/'}});
    const data=await res.json();
    return (data?.books||[]).slice(0,12).map((item:Record<string,unknown>)=>{const id=String(item.b_id||item.book_id||item.id||'');return {title:String(item.title||item.web_title||''),author:String(item.author||item.author_name||''),cover:id?`https://img.ridicdn.net/cover/${id}/xxlarge?dpi=xxhdpi`:'',url:id?`https://ridibooks.com/books/${id}`:'',totalCount:Number(item.volume_count||item.total_count||1),category:category(`${item.parent_category_name||''} ${item.category_name||''}`),platform:'리디북스'};});
  } catch { return []; }
}

async function kakao(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://bff-page.kakao.com/api/gateway/api/v1/search/series?keyword=${encodeURIComponent(q)}&category_uid=0&sort_type=ACCURACY&page=0&size=12`,{headers:{Accept:'application/json',Origin:'https://page.kakao.com',Referer:'https://page.kakao.com/','User-Agent':'Mozilla/5.0'}});
    const data=await res.json(); const items=data?.data||data?.result?.items||data?.result||[];
    return (Array.isArray(items)?items:[]).map((item:Record<string,unknown>)=>{const id=String(item.id||item.series_id||'');const thumb=String(item.thumbnail||item.image||'');return {title:String(item.title||''),author:String(item.author||item.author_name||''),cover:thumb.startsWith('http')?thumb:thumb?`https://dn-img-page.kakao.com/download/resource?kid=${thumb}`:'',url:id?`https://page.kakao.com/content/${id}`:'',totalCount:Number(item.on_sale_count||item.total_count||1),category:category(`${item.sub_category||''} ${item.category||''}`),platform:'카카오페이지'};});
  } catch { return []; }
}

export async function GET(req:NextRequest) {
  const q=req.nextUrl.searchParams.get('q')?.trim(); if(!q) return NextResponse.json({books:[]});
  const results=(await Promise.all([ridi(q),kakao(q)])).flat().filter(item=>item.title);
  const seen=new Set<string>(); const books=results.filter(item=>{const key=`${item.title}-${item.platform}`;if(seen.has(key))return false;seen.add(key);return true;});
  return NextResponse.json({books});
}
