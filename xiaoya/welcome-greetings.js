// A small cosmetic history, separate from the wallet and learning evidence.
// New immutable MP3 URLs are included by the normal offline audio build.
export const WELCOME_GREETINGS_KEY = 'xiaoya-english:welcome-greetings:v1';
export const FIRST_GREETING = 'welcome-gift-first';
export const WELCOME_GREETING_IDS = Object.freeze(Array.from({length:6}, (_,i) => `welcome-hello-${String(i+1).padStart(2,'0')}`));

function valid(record) {
  return record?.schema === 1 && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
    && [FIRST_GREETING,...WELCOME_GREETING_IDS].includes(record.id)
    && Array.isArray(record.remaining) && new Set(record.remaining).size === record.remaining.length
    && record.remaining.every(id => WELCOME_GREETING_IDS.includes(id) && id !== record.id);
}

export function nextWelcomeGreeting(record, {date, returning=false, random=Math.random}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('欢迎语需要本地日期。');
  const previous = valid(record) ? record : null;
  // Refreshes, another tab and a clock rollback keep the chosen voice stable.
  if (previous && date <= previous.date) return previous;
  if (!previous && !returning) return {schema:1,date,id:FIRST_GREETING,remaining:[]};
  let remaining = previous?.remaining.slice() || [];
  if (!remaining.length) {
    remaining = [...WELCOME_GREETING_IDS];
    for (let i=remaining.length-1;i>0;i--) {
      const j=Math.floor(Math.max(0,Math.min(0.999999999,random()))*(i+1));
      [remaining[i],remaining[j]]=[remaining[j],remaining[i]];
    }
    if (remaining[0] === previous?.id) [remaining[0],remaining[1]]=[remaining[1],remaining[0]];
  }
  return {schema:1,date,id:remaining[0],remaining:remaining.slice(1)};
}

export function createWelcomeGreetings(storage, random=Math.random) {
  let fallback=null;
  return ({date,returning=false}) => {
    let previous=fallback;
    try { const saved=JSON.parse(storage.getItem(WELCOME_GREETINGS_KEY)||'null'); if(valid(saved)&&(!fallback||saved.date>=fallback.date))previous=saved; } catch {}
    const next=nextWelcomeGreeting(previous,{date,returning,random});
    fallback=next;
    // A cosmetic preference must never block learning or a gift transaction.
    if(next!==previous)try{storage.setItem(WELCOME_GREETINGS_KEY,JSON.stringify(next));}catch{}
    return next.id;
  };
}
