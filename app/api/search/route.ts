import { NextRequest, NextResponse } from 'next/server';

type SearchBook = { title:string; author:string; cover:string; url:string; totalCount:number; category:string; platform:string };
const category = (text:string) => /BL|비엘/i.test(text) ? 'BL' : /로맨스판타지|로판/i.test(text) ? '로맨스판타지' : /로맨스/i.test(text) ? '로맨스' : '문학';
const positiveCount = (...values:unknown[]) => {
  for (const value of values) {
    const count=Number(value);
    if(Number.isFinite(count) && count > 0) return Math.round(count);
  }
  return 1;
};

async function ridi(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://ridibooks.com/apps/search/search?keyword=${encodeURIComponent(q)}&adult_exclude=n`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json',Referer:'https://ridibooks.com/'}});
    const data=await res.json();
    return (data?.books||[]).slice(0,12).map((item:Record<string,unknown>)=>{const id=String(item.b_id||item.book_id||item.id||'');const prices=Array.isArray(item.series_prices_info)?item.series_prices_info as Record<string,unknown>[]:[];const normal=prices.find(price=>price.type==='normal')||prices[0];return {title:String(item.title||item.web_title||''),author:String(item.author||item.author_name||''),cover:id?`https://img.ridicdn.net/cover/${id}/xxlarge?dpi=xxhdpi`:'',url:id?`https://ridibooks.com/books/${id}`:'',totalCount:positiveCount(item.book_count,item.volume_count,item.total_count,normal?.book_count,item.setbook_count),category:category(`${item.parent_category_name||''} ${item.parent_category_name2||''} ${item.category_name||''}`),platform:'리디북스'};});
  } catch { return []; }
}

async function kakao(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://bff-page.kakao.com/api/gateway/api/v1/search/series?keyword=${encodeURIComponent(q)}&category_uid=0&sort_type=ACCURACY&page=0&size=12`,{headers:{Accept:'application/json',Origin:'https://page.kakao.com',Referer:'https://page.kakao.com/','User-Agent':'Mozilla/5.0'}});
    const data=await res.json(); const result=data?.result; const items=data?.data||result?.list||result?.items||(Array.isArray(result)?result:[]);
    return await Promise.all((Array.isArray(items)?items:[]).map(async(item:Record<string,unknown>)=>{const id=String(item.id||item.series_id||'');const thumb=String(item.thumbnail||item.image||'');let totalCount=positiveCount(item.on_sale_count,item.total_count,item.slide_count,item.book_count);if(id&&!item.on_sale_count&&!item.total_count){try{const detail=await fetch(`https://bff-page.kakao.com/api/gateway/api/v2/content/product/list?series_id=${id}&cursor_index=0&cursor_direction=INIT&window_size=1`,{headers:{Accept:'application/json',Origin:'https://page.kakao.com',Referer:`https://page.kakao.com/content/${id}`,'User-Agent':'Mozilla/5.0'}});const detailData=await detail.json();totalCount=positiveCount(detailData?.result?.total_count,detailData?.result?.series_item?.on_sale_count,totalCount);}catch{}}return {title:String(item.title||''),author:String(item.authors||item.author||item.author_name||''),cover:thumb.startsWith('http')?thumb:thumb?`https://dn-img-page.kakao.com/download/resource?kid=${encodeURIComponent(thumb)}`:'',url:id?`https://page.kakao.com/content/${id}`:'',totalCount,category:category(`${item.sub_category||''} ${item.category||''}`),platform:'카카오페이지'};}));
  } catch { return []; }
}

const cleanHtml=(value:string)=>value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
async function naverImageCover(title:string,author:string) {
  try {
    const query=`${title} ${author} 네이버시리즈 표지`;
    const res=await fetch(`https://search.naver.com/search.naver?where=image&sm=tab_jum&query=${encodeURIComponent(query)}`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html',Referer:'https://search.naver.com/'}});
    const html=await res.text();
    const candidates=[...html.matchAll(/"originalUrl":"([^"]+)"/g)].map(match=>{try{return JSON.parse(`"${match[1]}"`) as string;}catch{return '';}}).filter(url=>/^https?:\/\//.test(url)&&!/(19over|noimg|adult|profile|icon|logo)/i.test(url));
    return (candidates[0]||'').replace(/^http:\/\//,'https://');
  } catch { return ''; }
}
async function naver(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://series.naver.com/search/search.series?t=all&fs=novel&q=${encodeURIComponent(q)}`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html',Referer:'https://series.naver.com/'}});
    const html=await res.text();
    const parsed=[...html.matchAll(/<li>[\s\S]*?<\/li>/g)].map(match=>match[0]).map(li=>{const title=li.match(/<a[^>]+href="([^"]*detail\.series\?productNo=[^"]+)"[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/);if(!title)return null;const raw=cleanHtml(title[2]);const count=raw.match(/\(총\s*([0-9]+)\s*(?:화|권)/);const image=li.match(/<img[^>]+src="([^"]+)"/);const author=li.match(/<span class="author">([\s\S]*?)<\/span>/);const imageUrl=image?image[1].replace(/&amp;/g,'&'):'';const isAdultPlaceholder=/19over_book|19세|adult/i.test(imageUrl);return {book:{title:raw.replace(/\s*\(총\s*[0-9]+(?:화|권)\/[^)]*\)\s*/g,'').trim(),author:author?cleanHtml(author[1]):'',cover:isAdultPlaceholder?'':imageUrl,url:`https://series.naver.com${title[1].replace(/&amp;/g,'&')}`,totalCount:Number(count?.[1]||1),category:category(li),platform:'네이버시리즈'} as SearchBook,isAdultPlaceholder};}).filter((item):item is {book:SearchBook;isAdultPlaceholder:boolean}=>Boolean(item)).slice(0,12);
    return parsed.map(item=>item.book);
  } catch { return []; }
}

export async function GET(req:NextRequest) {
  const q=req.nextUrl.searchParams.get('q')?.trim(); if(!q) return NextResponse.json({books:[]});
  const results=(await Promise.all([ridi(q),kakao(q),naver(q)])).flat().filter(item=>item.title);
  const normalize=(text:string)=>text.toLowerCase().replace(/\[[^\]]*\]|\(총[^)]*\)|단행본|개정판|완전판|외전|특별/g,'').replace(/[^0-9a-z가-힣]/g,'');
  for(const item of results) {
    if(item.cover || item.platform!=='네이버시리즈') continue;
    const titleKey=normalize(item.title);
    const authorKey=normalize(item.author.split(',')[0]||'');
    const match=results.find(candidate=>candidate.cover && candidate.platform!=='네이버시리즈' && normalize(candidate.title)===titleKey && (!authorKey || normalize(candidate.author).includes(authorKey)));
    if(match) item.cover=match.cover;
  }
  await Promise.all(results.map(async item=>{if(!item.cover&&item.platform==='네이버시리즈')item.cover=await naverImageCover(item.title,item.author);}));
  const queryKey=normalize(q);const exactKey=(text:string)=>text.toLowerCase().replace(/\s+/g,' ').trim();const exactQuery=exactKey(q);const platformRank:Record<string,number>={'리디북스':0,'카카오페이지':1,'네이버시리즈':2};
  results.sort((a,b)=>{const relevance=(item:SearchBook)=>{const key=normalize(item.title);return exactKey(item.title)===exactQuery?0:key===queryKey?1:key.startsWith(queryKey)?2:key.includes(queryKey)?3:4;};return relevance(a)-relevance(b)||(platformRank[a.platform]??9)-(platformRank[b.platform]??9);});
  const seen=new Set<string>(); const books=results.filter(item=>{const key=`${item.title}-${item.platform}`;if(seen.has(key))return false;seen.add(key);return true;});
  return NextResponse.json({books});
}
