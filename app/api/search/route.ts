import { NextRequest, NextResponse } from 'next/server';
import { getDocument } from '@/lib/firebase';

type SearchBook = { title:string; author:string; cover:string; url:string; totalCount:number; countUnit?:'권'|'화'; category:string; platform:string };
const category = (text:string) => /BL|비엘/i.test(text) ? 'BL' : /로맨스판타지|로판/i.test(text) ? '로맨스판타지' : /로맨스/i.test(text) ? '로맨스' : '문학';
const positiveCount = (...values:unknown[]) => {
  for (const value of values) {
    const count=Number(value);
    if(Number.isFinite(count) && count > 0) return Math.round(count);
  }
  return 1;
};

// Naver hides adult covers from signed-out search results. These are the
// public pstatic cover URLs observed on the age-verified product pages.
const naverVerifiedCovers:Record<string,string> = {
  '14567853':'https://comicthumb-phinf.pstatic.net/20260806_197/pocket_1785992982011gMLJ7_JPEG/%BF%C0%B8%DE%B0%A1%B9%F6%BD%BA%BF%A1%BC%AD_%BA%A3%C5%B8%B4%C2_%C3%D6%C1%BE%28%B1%C7%BC%F6X%29.jpg?type=m260',
};

async function ridiSearch(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://ridibooks.com/apps/search/search?keyword=${encodeURIComponent(q)}&adult_exclude=n`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json',Referer:'https://ridibooks.com/'}});
    const data=await res.json() as { books?: Record<string, unknown>[] };
    return (data?.books||[]).slice(0,24).map((item:Record<string,unknown>)=>{const id=String(item.b_id||item.book_id||item.id||'');const prices=Array.isArray(item.series_prices_info)?item.series_prices_info as Record<string,unknown>[]:[];const normal=prices.find(price=>price.type==='normal')||prices[0];return {title:String(item.title||item.web_title||''),author:String(item.author||item.author_name||''),cover:id?`https://img.ridicdn.net/cover/${id}/xxlarge?dpi=xxhdpi`:'',url:id?`https://ridibooks.com/books/${id}`:'',totalCount:positiveCount(item.book_count,item.volume_count,item.total_count,normal?.book_count,item.setbook_count),category:category(`${item.parent_category_name||''} ${item.parent_category_name2||''} ${item.category_name||''}`),platform:'리디북스'};});
  } catch { return []; }
}

async function ridi(q:string):Promise<SearchBook[]> {
  // Ridi separates ebooks and webtoons in search strongly enough that an
  // exact title query can omit the ebook entirely. Search the ebook scope as
  // well, with it first so the original book wins equal-title ordering.
  const queries=/\[?e북\]?/i.test(q)?[q]:[`[e북] ${q}`,q];
  const groups=await Promise.all(queries.map(ridiSearch));
  const seen=new Set<string>();
  return groups.flat().filter(item=>{const key=item.url||`${item.title}-${item.author}`;if(seen.has(key))return false;seen.add(key);return true;});
}

async function kakao(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://bff-page.kakao.com/api/gateway/api/v1/search/series?keyword=${encodeURIComponent(q)}&category_uid=0&sort_type=ACCURACY&page=0&size=12`,{headers:{Accept:'application/json',Origin:'https://page.kakao.com',Referer:'https://page.kakao.com/','User-Agent':'Mozilla/5.0'}});
    const data=await res.json() as any; const result=data?.result; const items=data?.data||result?.list||result?.items||(Array.isArray(result)?result:[]);
    return await Promise.all((Array.isArray(items)?items:[]).map(async(item:Record<string,unknown>)=>{const id=String(item.id||item.series_id||'');const thumb=String(item.thumbnail||item.image||'');let totalCount=positiveCount(item.on_sale_count,item.total_count,item.slide_count,item.book_count);if(id&&!item.on_sale_count&&!item.total_count){try{const detail=await fetch(`https://bff-page.kakao.com/api/gateway/api/v2/content/product/list?series_id=${id}&cursor_index=0&cursor_direction=INIT&window_size=1`,{headers:{Accept:'application/json',Origin:'https://page.kakao.com',Referer:`https://page.kakao.com/content/${id}`,'User-Agent':'Mozilla/5.0'}});const detailData=await detail.json() as any;totalCount=positiveCount(detailData?.result?.total_count,detailData?.result?.series_item?.on_sale_count,totalCount);}catch{}}return {title:String(item.title||''),author:String(item.authors||item.author||item.author_name||''),cover:thumb.startsWith('http')?thumb:thumb?`https://dn-img-page.kakao.com/download/resource?kid=${encodeURIComponent(thumb)}`:'',url:id?`https://page.kakao.com/content/${id}`:'',totalCount,category:category(`${item.sub_category||''} ${item.category||''}`),platform:'카카오페이지'};}));
  } catch { return []; }
}

const cleanHtml=(value:string)=>value.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
async function naver(q:string):Promise<SearchBook[]> {
  try {
    const res=await fetch(`https://series.naver.com/search/search.series?t=all&fs=novel&q=${encodeURIComponent(q)}`,{headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html',Referer:'https://series.naver.com/'}});
    const html=await res.text();
    const parsed=[...html.matchAll(/<li>[\s\S]*?<\/li>/g)].map(match=>match[0]).map(li=>{const title=li.match(/<a[^>]+href="([^"]*detail\.series\?productNo=[^"]+)"[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/);if(!title)return null;const raw=cleanHtml(title[2]);const count=raw.match(/\(총\s*([0-9]+)\s*(화|권)/);const image=li.match(/<img[^>]+src="([^"]+)"/);const author=li.match(/<span class="author">([\s\S]*?)<\/span>/);const href=title[1].replace(/&amp;/g,'&');const productNo=href.match(/[?&]productNo=([0-9]+)/)?.[1]||'';const rawImageUrl=image?image[1].replace(/&amp;/g,'&'):'';const imageUrl=rawImageUrl.startsWith('//')?`https:${rawImageUrl}`:rawImageUrl;const isAdultPlaceholder=/19over_book|19세|adult/i.test(imageUrl);const verifiedCover=naverVerifiedCovers[productNo]||'';return {book:{title:raw.replace(/\s*\(총\s*[0-9]+(?:화|권)\/[^)]*\)\s*/g,'').trim(),author:author?cleanHtml(author[1]):'',cover:verifiedCover||imageUrl,url:`https://series.naver.com${href}`,totalCount:Number(count?.[1]||1),countUnit:count?.[2] as '권'|'화'|undefined,category:category(li),platform:'네이버시리즈'} as SearchBook,isAdultPlaceholder};}).filter((item):item is {book:SearchBook;isAdultPlaceholder:boolean}=>Boolean(item)).slice(0,12);
    return parsed.map(item=>item.book);
  } catch { return []; }
}

export async function GET(req:NextRequest) {
  const q=req.nextUrl.searchParams.get('q')?.trim(); if(!q) return NextResponse.json({books:[]});
  const author=req.nextUrl.searchParams.get('author')?.trim()||'';
  const platform=req.nextUrl.searchParams.get('platform')?.trim()||'';
  const normalize=(text:string)=>text.toLowerCase().replace(/\[[^\]]*\]|\(총[^)]*\)|단행본|개정판|완전판|외전|특별/g,'').replace(/[^0-9a-z가-힣]/g,'');
  const providers=[
    {name:'리디북스',search:ridi},
    {name:'카카오페이지',search:kakao},
    {name:'네이버시리즈',search:naver},
  ].filter(provider=>!platform||provider.name===platform);
  const preciseQuery=author?`${q} ${author}`:q;
  const groups=await Promise.all(providers.map(async provider=>{
    const precise=await provider.search(preciseQuery);
    if(!author)return precise;
    const [byAuthor,broad]=await Promise.all([provider.search(author),provider.search(q)]);
    const seen=new Set<string>();
    return [...precise,...byAuthor,...broad].filter(item=>{const key=item.url||`${item.title}-${item.author}`;if(seen.has(key))return false;seen.add(key);return true;});
  }));
  let results=groups.flat().filter(item=>item.title);
  if(author){
    const titleKey=normalize(q);
    const authorKey=normalize(author);
    results=results.filter(item=>{
      const itemTitle=normalize(item.title);
      const itemAuthor=normalize(item.author);
      return (itemTitle.includes(titleKey)||titleKey.includes(itemTitle))&&itemAuthor.includes(authorKey);
    });
  }
  for (const item of results) item.countUnit ||= item.platform === '카카오페이지' && !/단행본|단권/.test(item.title) || item.totalCount >= 50 ? '화' : '권';
  for(const item of results) {
    if(item.cover || item.platform!=='네이버시리즈') continue;
    const titleKey=normalize(item.title);
    const authorKey=normalize(item.author.split(',')[0]||'');
    const match=results.find(candidate=>candidate.cover && candidate.platform!=='네이버시리즈' && normalize(candidate.title)===titleKey && (!authorKey || normalize(candidate.author).includes(authorKey)));
    if(match) item.cover=match.cover;
  }
  await Promise.all(results.map(async item=>{
    if(item.cover || item.platform!=='네이버시리즈') return;
    const productNo=item.url.match(/[?&]productNo=([0-9]+)/)?.[1];
    if(!productNo) return;
    try { const saved=await getDocument('naver_covers',productNo); if(saved?.cover_url)item.cover=String(saved.cover_url); } catch {}
  }));
  const queryKey=normalize(q);const exactKey=(text:string)=>text.toLowerCase().replace(/\s+/g,' ').trim();const exactQuery=exactKey(q);const platformRank:Record<string,number>={'리디북스':0,'카카오페이지':1,'네이버시리즈':2};
  results.sort((a,b)=>{const relevance=(item:SearchBook)=>{const key=normalize(item.title);return exactKey(item.title)===exactQuery?0:key===queryKey?1:key.startsWith(queryKey)?2:key.includes(queryKey)?3:4;};return relevance(a)-relevance(b)||(platformRank[a.platform]??9)-(platformRank[b.platform]??9);});
  const seen=new Set<string>(); const books=results.filter(item=>{const key=item.url||`${item.title}-${item.author}-${item.platform}`;if(seen.has(key))return false;seen.add(key);return true;});
  return NextResponse.json({books});
}
