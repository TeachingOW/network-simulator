// Initialize independently of the simulator so tabs stay usable if an
// experiment fails to load. Each tablist manages only its own tabs.
const initializedLists=new WeakSet();
const tabsFor=list=>[...list.querySelectorAll('[role="tab"]')].filter(tab=>tab.closest('[role="tablist"]')===list);

export function activateTab(panelId, {focus=false}={}) {
  const panel=document.getElementById(panelId);
  const tab=[...document.querySelectorAll('[role="tab"]')].find(tab=>tab.getAttribute('aria-controls')===panelId);
  const list=tab?.closest('[role="tablist"]');
  if(!list || !panel)return;
  for(const sibling of tabsFor(list)) {
    const active=sibling===tab;
    sibling.setAttribute('aria-selected',String(active));
    sibling.tabIndex=active?0:-1;
    const siblingPanel=document.getElementById(sibling.getAttribute('aria-controls'));
    if(siblingPanel)siblingPanel.hidden=!active;
  }
  if(focus)tab.focus();
}

export function revealTabFor(element) {
  if(!element)return;
  const panels=[];
  for(let parent=element;parent;parent=parent.parentElement)
    if(parent.getAttribute('role')==='tabpanel')panels.unshift(parent);
  panels.forEach(panel=>activateTab(panel.id));
}

export function initializeTabs() {
  for(const list of document.querySelectorAll('[role="tablist"]')) {
    if(initializedLists.has(list))continue;
    initializedLists.add(list);
    const tabs=tabsFor(list);
    const selected=tabs.find(tab=>tab.getAttribute('aria-selected')==='true')||tabs[0];
    if(selected)activateTab(selected.getAttribute('aria-controls'));
    list.addEventListener('click',event=>{
      const tab=event.target.closest('[role="tab"]');
      if(tab?.closest('[role="tablist"]')!==list)return;
      activateTab(tab.getAttribute('aria-controls'));
    });
    list.addEventListener('keydown',event=>{
      const tab=event.target.closest('[role="tab"]');
      if(tab?.closest('[role="tablist"]')!==list)return;
      const index=tabs.indexOf(tab);
      const vertical=list.getAttribute('aria-orientation')==='vertical';
      let next;
      if(event.key===(vertical?'ArrowDown':'ArrowRight'))next=(index+1)%tabs.length;
      if(event.key===(vertical?'ArrowUp':'ArrowLeft'))next=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=tabs.length-1;
      if(next===undefined)return;
      event.preventDefault();
      activateTab(tabs[next].getAttribute('aria-controls'),{focus:true});
    });
  }
}

if(typeof document!=='undefined') {
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeTabs,{once:true});
  else initializeTabs();
}
