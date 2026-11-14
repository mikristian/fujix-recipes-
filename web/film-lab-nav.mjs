/**
 * A true sibling of the existing FujiX Sync navigation buttons.
 * Clone the last built-in navigation item, so our control has the exact same
 * original typography, sizing, padding, icon weight and responsive behavior.
 * React's existing navigation and event handlers are left untouched.
 */
export function mountFilmLabNavigation(root=document.querySelector('#root')){
  if(!root)return ()=>{};
  const findItem=label=>[...root.querySelectorAll('button,a,[role="tab"]')]
    .find(element=>element.textContent?.trim()===label&&!element.closest('#fujix-film-lab-shortcut'));
  function attach(){
    // Original navigation can append additional tabs after React hydration.
    // Always place Film Lab after the actual rightmost known app tab.
    const last=findItem('AI Chat')||findItem('ArtCraft')||findItem('Camera Sync')||findItem('Library');
    if(!last)return;
    const existing=root.querySelector('#fujix-film-lab-shortcut');
    if(existing){
      if(last.nextElementSibling!==existing)last.after(existing);
      return;
    }
    const item=last.cloneNode(true);
    item.id='fujix-film-lab-shortcut';
    item.querySelectorAll('[id]').forEach(child=>child.removeAttribute('id'));
    item.querySelectorAll('[aria-selected],[aria-current],[aria-pressed],[disabled],[data-state]').forEach(child=>{
      child.removeAttribute('aria-selected');child.removeAttribute('aria-current');
      child.removeAttribute('aria-pressed');child.removeAttribute('disabled');child.removeAttribute('data-state');
    });
    item.removeAttribute('aria-selected');item.removeAttribute('aria-current');
    item.removeAttribute('aria-pressed');item.removeAttribute('disabled');item.removeAttribute('data-state');
    item.setAttribute('aria-label','Open Film Lab RAW photo editor');
    item.setAttribute('title','Film Lab — film recipes and camera-backed RAW photo development');
    if(item.tagName==='BUTTON')item.type='button';
    else item.setAttribute('href','/film-lab/');
    // Preserve the original markup and typography while replacing its label.
    // Some React tab labels have nested spans / whitespace text nodes, so an
    // exact text-node match can silently leave a duplicate "AI Chat" tab.
    let replaced=false;
    const walker=document.createTreeWalker(item,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(node.parentElement?.closest('svg'))continue;
      const before=node.textContent;
      const after=before.replace(/\b(?:AI\s+Chat|ArtCraft|Camera\s+Sync|Library)\b/g,'Film Lab');
      if(after!==before){node.textContent=after;replaced=true;}
    }
    if(!replaced){
      // Fallback for navigation designs which use a different last-tab label.
      const labels=[...item.querySelectorAll('*')].reverse().filter(el=>el.namespaceURI==='http://www.w3.org/1999/xhtml' && !el.children.length && !el.closest('svg') && el.textContent.trim());
      if(labels.length){labels[0].textContent='Film Lab';replaced=true;}
    }
    if(!replaced){item.append(document.createTextNode('Film Lab'))}
    // A simple edit/sliders glyph replaces the cloned tab's original icon.
    const svg=item.querySelector('svg');
    if(svg){
      svg.setAttribute('viewBox','0 0 24 24');
      svg.setAttribute('fill','none');
      svg.setAttribute('stroke','currentColor');
      svg.setAttribute('stroke-width','1.7');
      svg.setAttribute('stroke-linecap','round');
      svg.setAttribute('stroke-linejoin','round');
      svg.innerHTML='<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 16l5-5 3 3 2-2"/><circle cx="9" cy="9" r="1"/>';
    }
    item.addEventListener('click',event=>{
      if(event.defaultPrevented)return;
      if(item.tagName==='BUTTON')window.location.assign('/film-lab/');
    });
    last.after(item);
  }
  attach();
  const observer=new MutationObserver(attach);
  observer.observe(root,{childList:true,subtree:true});
  return ()=>{observer.disconnect();root.querySelector('#fujix-film-lab-shortcut')?.remove()};
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountFilmLabNavigation(),{once:true});
  else mountFilmLabNavigation();
}
