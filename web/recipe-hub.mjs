/**
 * FujiX Sync recipe hub. Standalone DOM screen that never mutates camera backups.
 * The server owns source metadata and persistence; this module only displays it.
 */
export function safeRecipeHubUrl(value, {image = false, origin = globalThis.location?.origin || 'http://localhost'} = {}) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value, origin);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    if (image && parsed.origin !== origin && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch { return ''; }
}

export function normalizeRecipeHubRecord(record, origin = globalThis.location?.origin || 'http://localhost') {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const string = (key) => typeof record[key] === 'string' ? record[key].trim() : '';
  return {
    ...record,
    name: string('name') || string('title') || 'Untitled recipe',
    description: string('description') || string('summary'),
    photo: safeRecipeHubUrl(string('photo') || string('imageUrl'), {image:true,origin}),
    sourceUrl: safeRecipeHubUrl(string('sourceUrl'), {origin}),
    sourceVerified: record.sourceVerified === true,
    author: string('author'),
  };
}

export function recipeHubSourceLinks(recipe, origin = globalThis.location?.origin || 'http://localhost') {
  const primary=safeRecipeHubUrl(recipe?.sourceUrl,{origin});
  const references=[primary,...(Array.isArray(recipe?.sourceUrls)?recipe.sourceUrls:[]),...(Array.isArray(recipe?.links)?recipe.links:[])];
  const unique=new Set();
  for(const candidate of references){
    const url=safeRecipeHubUrl(candidate,{origin});
    if(url)unique.add(url);
    if(unique.size>=8)break;
  }
  return [...unique].map((url,index)=>({
    url,
    label:url===primary?(recipe?.sourceLabel || 'Original source article'):'Linked reference '+(index+1),
    checked:url===primary && recipe?.sourceVerified===true,
  }));
}

export function shouldOpenRecipeHub(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('recipeHub') === '1';
}

if (typeof document !== 'undefined' && !document.getElementById('fx-recipe-hub')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '/recipe-hub.css';
  document.head.append(stylesheet);

  const root = document.createElement('section');
  root.id = 'fx-recipe-hub';
  root.hidden = true;
  root.setAttribute('aria-label', 'FujiX Sync recipe hub');
  root.innerHTML = `<div class="fx-hub-shell">
    <header class="fx-hub-header"><div class="fx-hub-brand"><span class="fx-hub-mark">F</span><div><span class="fx-hub-eyebrow">FUJIX SYNC / LIBRARY</span><h1>Film Recipes</h1></div></div>
      <button type="button" class="fx-hub-close" aria-label="Close recipe hub">Close <span aria-hidden="true">×</span></button></header>
    <div class="fx-hub-content">
      <div class="fx-hub-intro"><div><p class="fx-hub-overline">YOUR DIGITAL FILM ARCHIVE</p><h2>Find your next look.</h2><p>Explore your saved recipes and discover new looks before adding them to your collection.</p></div><div class="fx-hub-count" aria-live="polite">Loading recipes…</div></div>
      <div class="fx-hub-toolbar"><div class="fx-hub-tabs" role="tablist" aria-label="Recipe collections">
          <button id="fx-hub-tab-mine" type="button" role="tab" aria-selected="true" aria-controls="fx-hub-results">My Recipes</button>
          <button id="fx-hub-tab-library" type="button" role="tab" aria-selected="false" aria-controls="fx-hub-results">Recipe Library</button>
        </div><div class="fx-hub-controls"><label class="fx-hub-search"><span class="fx-hub-sr">Search recipes</span><input type="search" id="fx-hub-search" placeholder="Search recipes…" autocomplete="off"></label>
          <div class="fx-hub-view" role="group" aria-label="View style"><button type="button" data-view="grid" aria-pressed="true" title="Photo grid">▦ <span class="fx-hub-sr">Grid view</span></button><button type="button" data-view="list" aria-pressed="false" title="List view">☷ <span class="fx-hub-sr">List view</span></button></div></div></div>
      <div class="fx-hub-library-info" hidden><div><strong>Discover & stage recipes</strong><p>Preview recipes from a source URL and save them here for review. Your camera and personal archive are unchanged.</p></div>
        <form id="fx-hub-intake" class="fx-hub-intake"><label class="fx-hub-sr" for="fx-hub-url">Recipe article URL</label><input id="fx-hub-url" type="url" required placeholder="Paste a recipe article URL…" maxlength="2048" autocomplete="url"><button type="submit">Preview URL</button></form>
        <div id="fx-hub-preview" hidden></div></div>
      <p class="fx-hub-status" id="fx-hub-status" role="status" aria-live="polite"></p>
      <div id="fx-hub-results" role="tabpanel" aria-labelledby="fx-hub-tab-mine" class="fx-hub-grid" tabindex="0"></div>
    </div></div>
    <div id="fx-hub-detail" class="fx-hub-detail" hidden><div class="fx-hub-detail-shade" data-close="true"></div><section class="fx-hub-detail-panel" role="dialog" aria-modal="true" aria-labelledby="fx-hub-detail-title" tabindex="-1"><button type="button" class="fx-hub-detail-close" aria-label="Close recipe details">×</button><div class="fx-hub-detail-body"></div></section></div>`;
  document.body.append(root);

  const $ = selector => root.querySelector(selector);
  const state = {tab:'mine', view:'grid', mine:[], staged:[], search:'', preview:null, active:null, previousFocus:null, loadSerial:0};
  const safeUrl = safeRecipeHubUrl;
  const normalizeRecipe = normalizeRecipeHubRecord;
  function el(tag, className, content) {
    const node=document.createElement(tag);
    if(className) node.className=className;
    if(content !== undefined) node.textContent=String(content ?? '');
    return node;
  }
  function sourceLink(url, label='Read original article') {
    const href=safeUrl(url);
    if (!href) return null;
    const a=el('a','fx-hub-source',label);
    a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;
  }
  function photo(recipe, className='') {
    const frame=el('div','fx-hub-photo '+className);
    const src=safeUrl(recipe?.photo,{image:true});
    if(src) {
      const img=document.createElement('img');
      img.src=src;img.alt='';img.loading='lazy';img.decoding='async';
      img.addEventListener('error',()=>{img.remove();frame.classList.add('fx-hub-no-photo')});
      frame.append(img);
    } else frame.classList.add('fx-hub-no-photo');
    frame.append(el('span','fx-hub-photo-fallback','FUJIX'));
    return frame;
  }
  function value(recipe, field, fallback='') {
    const candidate=recipe?.[field];
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;
  }
  function fullDescription(recipe) {
    return value(recipe,'description','A film simulation recipe saved to your FujiX collection. Open the recipe for its available settings and original references.');
  }
  function background(recipe) {
    return value(recipe,'background','Background notes have not yet been verified from the original creator or published recipe article.');
  }
  function recipeSource(recipe) {
    return safeUrl(recipe?.sourceUrl) || (Array.isArray(recipe?.links) ? recipe.links.map(link=>safeUrl(link)).find(Boolean) : '') || '';
  }
  async function request(path, options={}) {
    const response=await fetch(path,{cache:'no-store',...options});
    let payload;
    try{payload=await response.json()}catch{throw new Error('The recipe service returned an unreadable response.')}
    if(!response.ok) throw new Error(typeof payload?.error==='string'?payload.error:`Request failed (${response.status}).`);
    return payload;
  }
  function setStatus(message='',error=false) {
    const p=$('#fx-hub-status');p.textContent=message;p.classList.toggle('fx-hub-error',error);
  }
  const normalized = payload=>Array.isArray(payload?.recipes)?payload.recipes.filter(item=>item && typeof item==='object' && typeof item.id==='string').map(normalizeRecipe):[];
  async function load() {
    const serial=++state.loadSerial;
    setStatus('Loading recipe collection…');
    const [mine, staged]=await Promise.allSettled([request('/api/recipe-hub/catalog'),request('/api/recipe-hub/staged')]);
    if(serial!==state.loadSerial)return;
    if(mine.status==='fulfilled') state.mine=normalized(mine.value);
    if(staged.status==='fulfilled') state.staged=normalized(staged.value);
    const failures=[mine,staged].filter(x=>x.status==='rejected');
    setStatus(failures.length?failures.map(x=>x.reason.message).join(' '):'',!!failures.length);
    render();
  }
  function render() {
    const isMine=state.tab==='mine';
    const data=isMine?state.mine:state.staged;
    const list=data.filter(recipe=>[recipe.name,recipe.description,recipe.background,recipe.category,recipe.backupNumber].some(entry=>String(entry??'').toLowerCase().includes(state.search)));
    $('#fx-hub-tab-mine').setAttribute('aria-selected',String(isMine));
    $('#fx-hub-tab-library').setAttribute('aria-selected',String(!isMine));
    $('#fx-hub-results').setAttribute('aria-labelledby',isMine?'fx-hub-tab-mine':'fx-hub-tab-library');
    $('.fx-hub-library-info').hidden=isMine;
    $('.fx-hub-count').textContent=`${data.length} ${data.length===1?'RECIPE':'RECIPES'}`;
    const results=$('#fx-hub-results');
    results.className='fx-hub-'+state.view;
    results.replaceChildren();
    if(!list.length){
      const empty=el('div','fx-hub-empty');
      empty.append(el('h3','',state.search?'No matching recipes':isMine?'No personal recipes loaded':'Your recipe library is ready'));
      empty.append(el('p','',state.search?'Try another name, description, or category.':isMine?'The saved recipe catalog could not be loaded or is currently empty.':'Paste a recipe article URL above to preview and stage your first discovery.'));
      results.append(empty);return;
    }
    const fragment=document.createDocumentFragment();
    for(const recipe of list){
      const card=el('div','fx-hub-card');
      const trigger=el('button','fx-hub-card-main');trigger.type='button';
      trigger.append(photo(recipe));
      const copy=el('div','fx-hub-card-copy');
      copy.append(el('span','fx-hub-card-meta',isMine?(recipe.backupNumber?`BACKUP ${recipe.backupNumber}`:'MY COLLECTION'):'STAGED RECIPE'));
      copy.append(el('h3','',value(recipe,'name','Untitled recipe')));
      copy.append(el('p','',fullDescription(recipe)));
      const footer=el('div','fx-hub-card-footer');
      footer.append(el('span','',value(recipe,'category',value(recipe?.settings,'filmSimulation','Film simulation'))));
      footer.append(el('span','', 'View details ↗'));
      copy.append(footer);trigger.append(copy);card.append(trigger);
      trigger.addEventListener('click',()=>openDetail(recipe));
      if(!isMine){
        const link=sourceLink(recipeSource(recipe),'View source article ↗');
        if(link){link.classList.add('fx-hub-card-source');card.append(link);}
      }
      fragment.append(card);
    }
    results.append(fragment);
  }
  function settingsList(settings) {
    const list=el('dl','fx-hub-settings');
    if(!settings || typeof settings!=='object' || Array.isArray(settings))return list;
    for(const [key,val] of Object.entries(settings)){
      if(val == null || typeof val === 'object' || String(val).trim()==='')continue;
      const field=key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,ch=>ch.toUpperCase());
      const item=el('div','');item.append(el('dt','',field),el('dd','',String(val)));list.append(item);
    }
    return list;
  }
  function buildDetails(recipe,{preview=false}={}) {
    const wrapper=el('div','fx-hub-detail-layout');
    wrapper.append(photo(recipe,'fx-hub-detail-photo'));
    const content=el('div','fx-hub-detail-copy');
    content.append(el('p','fx-hub-overline',preview?'URL PREVIEW':state.tab==='mine'?'MY RECIPES':'RECIPE LIBRARY'));
    const title=el('h2','',value(recipe,'name','Untitled recipe'));title.id='fx-hub-detail-title';content.append(title);
    if(recipe.backupNumber)content.append(el('p','fx-hub-detail-kicker',`Backup ${recipe.backupNumber}`));
    content.append(el('h3','','Description'),el('p','',fullDescription(recipe)));
    if(recipe.author)content.append(el('p','fx-hub-detail-kicker',`Recipe by ${recipe.author}`));
    content.append(el('h3','','Background & inspiration'),el('p','',background(recipe)));
    const settings=settingsList(recipe.settings);
    if(settings.children.length){content.append(el('h3','','Recipe settings'),settings);}
    const sources=recipeHubSourceLinks(recipe);
    if(sources.length){
      content.append(el('h3','','Linked references'));
      const sourceList=el('ul','fx-hub-source-list');
      for(const reference of sources){
        const item=el('li','fx-hub-source-item');
        const link=sourceLink(reference.url,reference.label+' ↗');
        item.append(link,el('span','fx-hub-source-address',reference.url));
        item.append(el('span','fx-hub-source-note',reference.checked?'Article checked against original source':'Linked reference — content not independently verified'));
        sourceList.append(item);
      }
      content.append(sourceList);
    }
    else content.append(el('p','fx-hub-muted','No verified article URL is attached to this recipe yet.'));
    if(preview){
      const stage=el('button','fx-hub-primary','Add to Recipe Library');stage.type='button';stage.addEventListener('click',()=>void stageRecipe(recipe,stage));
      content.append(stage);
    }else if(state.tab==='library'){
      const remove=el('button','fx-hub-remove','Remove staged recipe');remove.type='button';remove.addEventListener('click',()=>void removeRecipe(recipe,remove));
      content.append(remove);
    }
    wrapper.append(content);return wrapper;
  }
  function openDetail(recipe,{preview=false}={}) {
    state.active=recipe;state.previousFocus=document.activeElement;
    const panel=$('#fx-hub-detail');
    $('.fx-hub-detail-body').replaceChildren(buildDetails(recipe,{preview}));
    panel.hidden=false;
    $('.fx-hub-detail-panel').focus();
  }
  function closeDetail() {
    $('#fx-hub-detail').hidden=true;state.active=null;
    if(state.previousFocus?.isConnected)state.previousFocus.focus();
  }
  async function stageRecipe(recipe,button){
    if(button.disabled)return;
    button.disabled=true;button.textContent='Saving…';
    try{
      await request('/api/recipe-hub/staged',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipe})});
      closeDetail();state.preview=null;$('#fx-hub-preview').hidden=true;$('#fx-hub-url').value='';state.tab='library';
      await load();setStatus('Recipe added to your review library.');
    }catch(error){button.disabled=false;button.textContent='Add to Recipe Library';setStatus(error.message,true)}
  }
  async function removeRecipe(recipe,button){
    if(button.disabled)return;
    button.disabled=true;
    try{
      await request('/api/recipe-hub/staged/'+encodeURIComponent(recipe.id),{method:'DELETE'});
      closeDetail();await load();setStatus('Staged recipe removed.');
    }catch(error){button.disabled=false;setStatus(error.message,true)}
  }
  const nav=el('button','fx-hub-open','Film Recipes');nav.id='fx-recipe-hub-open';nav.type='button';
  nav.setAttribute('aria-controls','fx-recipe-hub');nav.setAttribute('aria-expanded','false');
  document.body.append(nav);
  function openHub(){
    state.previousFocus=document.activeElement;
    root.hidden=false;nav.setAttribute('aria-expanded','true');
    $('#fx-hub-tab-mine').focus();void load();
  }
  function closeHub(){
    if(!$('#fx-hub-detail').hidden)closeDetail();
    root.hidden=true;nav.setAttribute('aria-expanded','false');nav.focus();
  }
  nav.addEventListener('click',()=>root.hidden?openHub():closeHub());
  $('.fx-hub-close').addEventListener('click',closeHub);
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();if(!$('#fx-hub-detail').hidden)closeDetail();else closeHub();return;}
    if(event.key==='Tab' && !$('#fx-hub-detail').hidden){
      const panel=$('.fx-hub-detail-panel');
      const focusable=[...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled)')].filter(node=>node.getClientRects().length);
      if(focusable.length){
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey && (document.activeElement===first || document.activeElement===panel)){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
  });
  $('.fx-hub-detail-close').addEventListener('click',closeDetail);
  $('.fx-hub-detail-shade').addEventListener('click',closeDetail);
  for(const [id,tab] of [['#fx-hub-tab-mine','mine'],['#fx-hub-tab-library','library']]){
    $(id).addEventListener('click',()=>{state.tab=tab;state.search='';$('#fx-hub-search').value='';render()});
  }
  $('.fx-hub-tabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();const next=state.tab==='mine'?'#fx-hub-tab-library':'#fx-hub-tab-mine';$(next).click();$(next).focus();
  });
  $('#fx-hub-search').addEventListener('input',event=>{state.search=event.target.value.trim().toLowerCase();render()});
  $('.fx-hub-view').addEventListener('click',event=>{
    const button=event.target.closest('[data-view]');if(!button)return;
    state.view=button.dataset.view;
    for(const item of $('.fx-hub-view').querySelectorAll('[data-view]'))item.setAttribute('aria-pressed',String(item===button));
    render();
  });
  $('#fx-hub-intake').addEventListener('submit',async event=>{
    event.preventDefault();
    const url=$('#fx-hub-url').value.trim();
    if(!safeUrl(url) || !/^https?:\/\//i.test(url)){setStatus('Enter a complete http:// or https:// recipe article URL.',true);return;}
    const button=$('#fx-hub-intake button[type=submit]');button.disabled=true;button.textContent='Checking…';
    state.preview=null;$('#fx-hub-preview').hidden=true;setStatus('Retrieving recipe preview…');
    try{
      const result=await request('/api/recipe-hub/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
      if(!result?.recipe || typeof result.recipe!=='object')throw Error('The source did not provide a recipe preview.');
      state.preview=normalizeRecipe(result.recipe);
      const preview=$('#fx-hub-preview');preview.replaceChildren();
      const row=el('div','fx-hub-preview-row');row.append(photo(state.preview));
      const description=el('div','');description.append(el('strong','',value(state.preview,'name','New recipe')),el('p','',fullDescription(state.preview)));
      const source=sourceLink(recipeSource(state.preview),'Original article ↗');
      if(source)description.append(source);
      const show=el('button','fx-hub-primary','Review & stage');show.type='button';show.addEventListener('click',()=>openDetail(state.preview,{preview:true}));
      description.append(show);row.append(description);preview.append(row);preview.hidden=false;
      setStatus('Preview ready. Review the recipe and source before staging.');
    }catch(error){setStatus(error.message,true)}
    finally{button.disabled=false;button.textContent='Preview URL'}
  });
  window.addEventListener('fujix:open-recipe-hub',openHub);
  // Successful local JSON restore invalidates the in-memory staged recipe
  // list. Reload from the backend instead of rendering stale cached records.
  document.addEventListener('fujix-recipes-restored',()=>{void load()});
  if(shouldOpenRecipeHub())openHub();
  // React owns the existing Recipes navigation. Attach a sibling control when
  // that tab is present, and reattach after React replaces its own nav nodes.
  function attachRecipesShortcut() {
    const app=document.querySelector('#root');
    if(!app)return;
    const recipesTab=[...app.querySelectorAll('button,[role="tab"],a')].find(candidate=>{
      if(candidate.textContent?.trim() !== 'Recipes')return false;
      if(candidate.matches('a[href^="http"]'))return false;
      return !candidate.closest('#fx-recipe-hub');
    });
    if(!recipesTab || recipesTab.nextElementSibling?.classList.contains('fx-hub-recipes-shortcut'))return;
    const shortcut=el('button','fx-hub-recipes-shortcut','Photo Recipe Library ↗');
    shortcut.type='button';shortcut.setAttribute('aria-label','Open photo recipe library');
    shortcut.addEventListener('click',openHub);
    recipesTab.after(shortcut);
  }
  attachRecipesShortcut();
  const app=document.querySelector('#root');
  if(app)new MutationObserver(attachRecipesShortcut).observe(app,{childList:true,subtree:true});
}
