/**
 * Non-invasive launcher for the existing Library tools.
 * Import once after the page loads. Does not interfere with the React tree,
 * Bluetooth, camera state, or the original dialog event handlers.
 */
const ROOT_ID='fujix-library-tools';
const TAB_ID='phone-btn-library-live-monitor';
const TOOLS=Object.freeze([
  {id:'fujix-offline-open',label:'Film Lab & Workflows',description:'Offline film lab, imports, and creative workflows'},
  {id:'fujix-photo-audit-open',label:'Photo Archive Integrity',description:'Verify local photo bytes, detect damaged files and duplicates, compare audit receipts'},
  {id:'fujix-recipes-backup-open',label:'Recipe Backups',description:'Export and safely restore staged film recipes without changing camera settings'},
  {id:'fujix-wlan-open',label:'Camera Wi-Fi Setup',description:'Camera network setup and connection guidance'}
]);

function isActiveLibrary(){
  const nav=document.getElementById(TAB_ID)
    || [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Library');
  if(!nav || !/\bLibrary\b/.test(nav.textContent||''))return false;
  return nav.getAttribute('aria-selected')==='true'
    || nav.getAttribute('aria-current')==='page'
    || nav.classList.contains('text-sky-400');
}

export function mountLibraryTools(){
  if(typeof document==='undefined')return ()=>{};
  const previous=document.getElementById(ROOT_ID);
  if(previous)return previous.__fujixCleanup||(()=>{});

  const root=document.createElement('section');
  root.id=ROOT_ID;
  root.hidden=true;
  root.setAttribute('aria-label','Library Tools');
  root.innerHTML=`
    <button type="button" class="fxlt-launcher" aria-expanded="false" aria-controls="fxlt-panel" aria-haspopup="true">
      <span class="fxlt-icon" aria-hidden="true">▦</span><span>Library Tools</span><span class="fxlt-chevron" aria-hidden="true">⌃</span>
    </button>
    <div id="fxlt-panel" class="fxlt-panel" role="region" aria-label="Library Tools menu" hidden>
      <div class="fxlt-heading"><div><span class="fxlt-eyebrow">FUJIX SYNC</span><h2>Library Tools</h2><p>Workflows and camera utilities</p></div><button type="button" class="fxlt-close" aria-label="Close Library Tools">×</button></div>
      <div class="fxlt-items"></div>
    </div>`;
  const launcher=root.querySelector('.fxlt-launcher');
  const panel=root.querySelector('.fxlt-panel');
  const closeButton=root.querySelector('.fxlt-close');
  const items=root.querySelector('.fxlt-items');
  for(const tool of TOOLS){
    const button=document.createElement('button');
    button.type='button';
    button.className='fxlt-item';
    button.innerHTML='<span class="fxlt-item-copy"><strong></strong><small></small></span><span aria-hidden="true" class="fxlt-item-arrow">↗</span>';
    button.querySelector('strong').textContent=tool.label;
    button.querySelector('small').textContent=tool.description;
    button.addEventListener('click',()=>{
      // The pre-existing button retains its event listeners and click behavior.
      const original=document.getElementById(tool.id);
      if(!original){button.setAttribute('aria-description','Tool is currently unavailable');return;}
      dismiss();
      original.click();
    });
    items.appendChild(button);
  }
  document.body.appendChild(root);

  let opened=false;
  function dismiss(){
    if(!opened)return;
    opened=false;
    panel.hidden=true;
    launcher.setAttribute('aria-expanded','false');
  }
  function sync(){
    const visible=isActiveLibrary();
    if(root.hidden===visible)root.hidden=!visible;
    if(!visible)dismiss();
  }
  launcher.addEventListener('click',()=>{
    if(root.hidden)return;
    opened=!opened;
    panel.hidden=!opened;
    launcher.setAttribute('aria-expanded',String(opened));
    if(opened)closeButton.focus();
  });
  closeButton.addEventListener('click',()=>{dismiss();launcher.focus();});
  const onKeydown=event=>{
    if(event.key==='Escape'&&opened){dismiss();launcher.focus();}
  };
  const onPointer=event=>{
    if(opened&&!root.contains(event.target))dismiss();
  };
  document.addEventListener('keydown',onKeydown);
  document.addEventListener('pointerdown',onPointer);
  // Observe only navigation attributes and React's layout changes. sync()
  // makes no DOM writes when the visibility state already matches.
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-selected','aria-current']});
  sync();
  const cleanup=()=>{
    observer.disconnect();
    document.removeEventListener('keydown',onKeydown);
    document.removeEventListener('pointerdown',onPointer);
    root.remove();
  };
  root.__fujixCleanup=cleanup;
  return cleanup;
}

if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountLibraryTools,{once:true});
  else mountLibraryTools();
}
