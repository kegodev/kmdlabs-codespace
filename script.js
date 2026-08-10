/* ---------------- file type helpers ---------------- */
const EXT_MAP = {
  html:{color:'var(--c-html)',lang:'html',runnable:true},
  htm:{color:'var(--c-html)',lang:'html',runnable:true},
  css:{color:'var(--c-css)',lang:'css',runnable:true},
  js:{color:'var(--c-js)',lang:'javascript',runnable:true},
  mjs:{color:'var(--c-js)',lang:'javascript',runnable:true},
  jsx:{color:'var(--c-js)',lang:'javascript',runnable:false},
  ts:{color:'var(--c-ts)',lang:'typescript',runnable:false},
  tsx:{color:'var(--c-ts)',lang:'typescript',runnable:false},
  json:{color:'var(--c-json)',lang:'json',runnable:false},
  md:{color:'var(--c-md)',lang:'markdown',runnable:false},
  markdown:{color:'var(--c-md)',lang:'markdown',runnable:false},
  php:{color:'var(--c-php)',lang:'php',runnable:false},
  py:{color:'var(--c-py)',lang:'python',runnable:false},
  txt:{color:'var(--c-other)',lang:'text',runnable:false},
  xml:{color:'var(--c-other)',lang:'xml',runnable:false},
  yml:{color:'var(--c-other)',lang:'yaml',runnable:false},
  yaml:{color:'var(--c-other)',lang:'yaml',runnable:false},
  svg:{color:'var(--c-img)',lang:'image',runnable:false,binary:true},
  png:{color:'var(--c-img)',lang:'image',runnable:false,binary:true},
  jpg:{color:'var(--c-img)',lang:'image',runnable:false,binary:true},
  jpeg:{color:'var(--c-img)',lang:'image',runnable:false,binary:true},
  gif:{color:'var(--c-img)',lang:'image',runnable:false,binary:true},
  webp:{color:'var(--c-img)',lang:'image',runnable:false,binary:true}
};
function basename(path){
  const parts = path.split('/');
  return parts[parts.length-1];
}
function dirOf(path){
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}
function extOf(path){
  const b = basename(path);
  const parts = b.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}
function typeInfo(path){
  return EXT_MAP[extOf(path)] || {color:'var(--c-other)',lang:'text',runnable:false};
}

/* ---------------- virtual file system ---------------- */
let files = {};             // path -> { content, binary }
let activeFile = null;
let collapsedFolders = new Set();
let openTabs = [];
let savedSettings = {};

const defaults = {
  'index.html': `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="card">
    <h1>Build with KM Digital Labs</h1>
    <p>Write HTML, CSS and JavaScript. Your live result appears in the preview panel.</p>
    <button id="btn">Click me</button>
  </div>
  <script src="script.js"><\/script>
</body>
</html>`,
  'style.css': `:root{
  --paper:#f5f2e9;
  --paper-alt:#eeeae0;
  --charcoal:#171916;
  --ink:#10110f;
  --orange:#f36a2d;
  --orange-deep:#b84216;
  --green:#2f5d45;
  --green-soft:#cdd9c8;
}
*{box-sizing:border-box;}
body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:24px;
  font-family:Arial,sans-serif;
  background:
    radial-gradient(circle at 80% 15%,rgba(243,106,45,.13),transparent 24%),
    var(--charcoal);
}
.card{
  width:min(520px,100%);
  background:var(--paper);
  border:1px solid var(--orange);
  border-radius:20px;
  padding:34px;
  color:var(--ink);
  text-align:center;
  box-shadow:0 24px 70px rgba(0,0,0,.34);
}
.card::before{
  content:'KM DIGITAL LABS · CODESPACE';
  display:inline-block;
  margin-bottom:18px;
  padding:7px 11px;
  border-radius:999px;
  background:var(--green-soft);
  color:var(--green);
  font-size:11px;
  font-weight:700;
  letter-spacing:.08em;
}
h1{color:var(--orange-deep);margin:0 0 9px;}
p{color:#6d7169;line-height:1.6;}
button{
  margin-top:16px;
  background:var(--orange);
  border:1px solid var(--orange);
  color:var(--ink);
  padding:10px 20px;
  border-radius:11px;
  cursor:pointer;
  font-size:14px;
  font-weight:700;
  transition:.18s ease;
}
button:hover{background:#df5920;transform:translateY(-2px);}`,
  'script.js': `let count = 0;
document.getElementById('btn').addEventListener('click', () => {
  count++;
  console.log('clicked', count, 'times');
});
console.log('script loaded');`
};

function loadDefaults(){
  files = {};
  Object.keys(defaults).forEach(name => { files[name] = {content: defaults[name], binary:false}; });
  activeFile = 'index.html';
  collapsedFolders = new Set();
  openTabs = ['index.html','style.css','script.js'];
}

const STORAGE_KEY = 'kmdlabs-codespace-workspace-v4';
const LEGACY_STORAGE_KEY = 'kmdlabs-codespace-workspace-v3';
const saveStatus = document.getElementById('saveStatus');
const cursorStatus = document.getElementById('cursorStatus');
let saveTimer = null;

function setSaveStatus(text, state){
  saveStatus.textContent = text;
  saveStatus.className = state || '';
}
function saveWorkspace(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version:4,
      files,
      activeFile,
      openTabs,
      collapsedFolders:[...collapsedFolders],
      settings:{autoRun,previewOpen,consoleCollapsed:document.getElementById('consolePanel')?.classList.contains('collapsed') || false}
    }));
    setSaveStatus('saved locally', 'saved');
  }catch(error){
    setSaveStatus('storage full — download files', 'error');
    console.warn('Workspace could not be saved locally:', error);
  }
}
function scheduleSave(){
  setSaveStatus('saving…', 'saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWorkspace, 260);
}
function restoreWorkspace(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if(!raw) return false;
    const saved = JSON.parse(raw);
    if(!saved || !saved.files || typeof saved.files !== 'object') return false;
    files = saved.files;
    activeFile = saved.activeFile && files[saved.activeFile] ? saved.activeFile : Object.keys(files)[0] || null;
    collapsedFolders = new Set(Array.isArray(saved.collapsedFolders) ? saved.collapsedFolders : []);
    openTabs = Array.isArray(saved.openTabs) ? saved.openTabs.filter(path => files[path]) : (activeFile ? [activeFile] : []);
    if(activeFile && !openTabs.includes(activeFile)) openTabs.unshift(activeFile);
    savedSettings = saved.settings && typeof saved.settings === 'object' ? saved.settings : {};
    return true;
  }catch(error){
    return false;
  }
}
if(!restoreWorkspace()) loadDefaults();

/* ---------------- sidebar tree rendering ---------------- */
const fileList = document.getElementById('fileList');
const fileFilter = document.getElementById('fileFilter');
const workspaceStatus = document.getElementById('workspaceStatus');
const compileStatus = document.getElementById('compileStatus');
const languageStatus = document.getElementById('languageStatus');
const folderIconSVG = '<svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';
const deleteButtonHTML = '<button type="button" class="row-action del" title="Delete" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg></button>';
const renameButtonHTML = '<button type="button" class="row-action rename" title="Rename" aria-label="Rename"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5z"/></svg></button>';
function escapeHTML(value){
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
function normalizeUserPath(value){
  return String(value || '').trim().replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').replace(/\/{2,}/g,'/');
}

function buildTree(paths){
  const root = {folders:{}, files:[]};
  paths.forEach(p => {
    const parts = p.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if(i === parts.length - 1){
        node.files.push({name: part, path: p});
      } else {
        if(!node.folders[part]) node.folders[part] = {folders:{}, files:[]};
        node = node.folders[part];
      }
    });
  });
  return root;
}

function renderFileList(){
  fileList.innerHTML = '';
  const query = (fileFilter?.value || '').trim().toLowerCase();
  const visiblePaths = Object.keys(files).filter(path => !query || path.toLowerCase().includes(query));
  const tree = buildTree(visiblePaths);
  renderTreeLevel(tree, fileList, 0, '');
  if(!visiblePaths.length) fileList.innerHTML = '<div class="editor-empty">no matching files</div>';
  workspaceStatus.textContent = Object.keys(files).length + (Object.keys(files).length === 1 ? ' file' : ' files');
}

fileFilter?.addEventListener('input', renderFileList);

function renderTreeLevel(node, container, depth, prefix){
  Object.keys(node.folders).sort().forEach(folderName => {
    const fullPath = prefix ? prefix + '/' + folderName : folderName;
    const expanded = !collapsedFolders.has(fullPath);
    const row = document.createElement('div');
    row.className = 'file-row folder-row' + (expanded ? ' expanded' : '');
    row.style.paddingLeft = (8 + depth*14) + 'px';
    row.innerHTML = '<span class="chev">&#9656;</span>' + folderIconSVG + '<span class="fname">'+escapeHTML(folderName)+'</span><span class="row-actions">' + deleteButtonHTML + '</span>';
    row.addEventListener('click', e => {
      if(e.target.closest('.row-action')) return;
      if(collapsedFolders.has(fullPath)) collapsedFolders.delete(fullPath);
      else collapsedFolders.add(fullPath);
      renderFileList();
      scheduleSave();
    });
    row.querySelector('.del').addEventListener('click', e => {
      e.stopPropagation();
      requestDelete({kind:'folder', path:fullPath, label:folderName});
    });
    container.appendChild(row);
    if(expanded) renderTreeLevel(node.folders[folderName], container, depth+1, fullPath);
  });

  node.files.sort((a,b) => a.name.localeCompare(b.name)).forEach(file => {
    const info = typeInfo(file.path);
    const row = document.createElement('div');
    row.className = 'file-row' + (file.path === activeFile ? ' active' : '');
    row.style.paddingLeft = (8 + depth*14 + 16) + 'px';
    row.title = file.path;
    row.innerHTML = '<span class="sq" style="background:'+info.color+'"></span><span class="fname">'+escapeHTML(file.name)+'</span><span class="row-actions">' + renameButtonHTML + deleteButtonHTML + '</span>';
    row.addEventListener('click', e => {
      if(e.target.closest('.row-action')) return;
      if(isMobileLayout() && document.body.classList.contains('file-manage-mode')) return;
      openFile(file.path);
      if(isMobileLayout()) setMobileView('editor');
    });
    row.querySelector('.rename').addEventListener('click', e => {
      e.stopPropagation();
      const requested = prompt('Rename file or move it to a folder:', file.path);
      const newPath = normalizeUserPath(requested);
      if(!newPath || newPath === file.path) return;
      if(files[newPath]){ alert('A file with that path already exists.'); return; }
      files[newPath] = files[file.path];
      delete files[file.path];
      if(activeFile === file.path) activeFile = newPath;
      openTabs = openTabs.map(path => path === file.path ? newPath : path);
      renderFileList();
      renderEditor();
      scheduleRun();
      scheduleSave();
    });
    row.querySelector('.del').addEventListener('click', e => {
      e.stopPropagation();
      requestDelete({kind:'file', path:file.path, label:file.name});
    });
    container.appendChild(row);
  });
}


/* ---------------- mobile file management ---------------- */
const manageFilesBtn = document.getElementById('manageFilesBtn');
const deleteSheet = document.getElementById('deleteSheet');
const deleteSheetMessage = document.getElementById('deleteSheetMessage');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const deleteSheetBackdrop = document.getElementById('deleteSheetBackdrop');
let pendingDelete = null;

function setFileManageMode(enabled){
  document.body.classList.toggle('file-manage-mode', enabled);
  manageFilesBtn?.classList.toggle('active', enabled);
  manageFilesBtn?.setAttribute('aria-pressed', String(enabled));
}
manageFilesBtn?.addEventListener('click', () => {
  setFileManageMode(!document.body.classList.contains('file-manage-mode'));
});

function closeDeleteSheet(){
  deleteSheet.classList.remove('open');
  deleteSheet.setAttribute('aria-hidden','true');
  pendingDelete = null;
}
function completeDelete(item){
  if(!item) return;
  if(item.kind === 'folder'){
    Object.keys(files).forEach(path => { if(path.startsWith(item.path + '/')) delete files[path]; });
    openTabs = openTabs.filter(path => !path.startsWith(item.path + '/'));
    if(activeFile && activeFile.startsWith(item.path + '/')) activeFile = Object.keys(files)[0] || null;
  }else{
    delete files[item.path];
    openTabs = openTabs.filter(path => path !== item.path);
    if(activeFile === item.path) activeFile = Object.keys(files)[0] || null;
  }
  renderFileList();
  renderEditor();
  scheduleRun();
  scheduleSave();
  if(isMobileLayout()) setFileManageMode(false);
}
function requestDelete(item){
  const label = item.kind === 'folder' ? 'folder "' + item.label + '" and everything inside it' : 'file "' + item.path + '"';
  if(!isMobileLayout()){
    if(confirm('Delete ' + label + '?')) completeDelete(item);
    return;
  }
  pendingDelete = item;
  deleteSheetMessage.textContent = 'Delete ' + label + '? This cannot be undone after the workspace is saved.';
  deleteSheet.classList.add('open');
  deleteSheet.setAttribute('aria-hidden','false');
  setTimeout(() => confirmDeleteBtn.focus(), 0);
}
cancelDeleteBtn?.addEventListener('click', closeDeleteSheet);
deleteSheetBackdrop?.addEventListener('click', closeDeleteSheet);
confirmDeleteBtn?.addEventListener('click', () => {
  const item = pendingDelete;
  closeDeleteSheet();
  completeDelete(item);
});
document.addEventListener('keydown', event => {
  if(event.key === 'Escape' && deleteSheet.classList.contains('open')) closeDeleteSheet();
});

/* ---------------- editor rendering ---------------- */
const editorWrap = document.getElementById('editorWrap');
const editorTopline = document.getElementById('editorTopline');
const editorTabs = document.getElementById('editorTabs');
let currentTextarea = null;
let currentAutocomplete = null;

function touchTab(path){
  if(!path || !files[path]) return;
  if(!openTabs.includes(path)) openTabs.push(path);
  if(openTabs.length > 10) openTabs.splice(openTabs.findIndex(tab => tab !== activeFile), 1);
}

function openFile(path, options = {}){
  if(!files[path]) return;
  activeFile = path;
  touchTab(path);
  renderFileList();
  renderEditor();
  if(!options.skipSave) scheduleSave();
  if(options.line && currentTextarea){
    const lines = currentTextarea.value.split('\n');
    const position = lines.slice(0, Math.max(0, options.line - 1)).reduce((total, line) => total + line.length + 1, 0);
    currentTextarea.focus();
    currentTextarea.setSelectionRange(position, position);
    currentTextarea.scrollTop = Math.max(0, (options.line - 3) * (parseFloat(getComputedStyle(currentTextarea).lineHeight) || 21));
  }
}

function closeTab(path){
  const index = openTabs.indexOf(path);
  if(index < 0) return;
  openTabs.splice(index, 1);
  if(activeFile === path){
    activeFile = openTabs[index] || openTabs[index - 1] || null;
    if(!activeFile) activeFile = Object.keys(files)[0] || null;
  }
  renderFileList();
  renderEditor();
  scheduleSave();
}

function renderTabs(){
  openTabs = openTabs.filter(path => files[path]);
  if(activeFile) touchTab(activeFile);
  editorTabs.innerHTML = '';
  openTabs.forEach(path => {
    const info = typeInfo(path);
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'editor-tab' + (path === activeFile ? ' active' : '');
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-selected', String(path === activeFile));
    tab.title = path;
    tab.innerHTML = '<span class="sq" style="background:'+info.color+'"></span><span class="tab-name">'+escapeHTML(basename(path))+'</span><span class="tab-close" title="Close tab" aria-label="Close tab">×</span>';
    tab.addEventListener('click', event => {
      if(event.target.closest('.tab-close')) closeTab(path);
      else openFile(path);
    });
    editorTabs.appendChild(tab);
  });
}

const HTML_VOID_TAGS = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const HTML_TAGS = ['html','head','body','title','meta','link','style','script','header','nav','main','section','article','aside','footer','div','span','h1','h2','h3','h4','h5','h6','p','a','button','form','label','input','textarea','select','option','ul','ol','li','img','picture','source','video','audio','canvas','table','thead','tbody','tr','th','td','br','hr'];
const CSS_SNIPPETS = [
  ['display','display: flex;','CSS property'],['display-grid','display: grid;','CSS property'],['position','position: relative;','CSS property'],
  ['color','color: #10110f;','CSS property'],['background','background: #f5f2e9;','CSS property'],['margin','margin: 0;','CSS property'],
  ['padding','padding: 16px;','CSS property'],['border','border: 1px solid #dcd8cd;','CSS property'],['radius','border-radius: 12px;','CSS property'],
  ['width','width: 100%;','CSS property'],['height','height: 100%;','CSS property'],['max-width','max-width: 1200px;','CSS property'],
  ['font-size','font-size: 16px;','CSS property'],['font-family','font-family: Arial, sans-serif;','CSS property'],['font-weight','font-weight: 600;','CSS property'],
  ['align-items','align-items: center;','Flexbox'],['justify-content','justify-content: center;','Flexbox'],['gap','gap: 16px;','Layout'],
  ['grid-columns','grid-template-columns: repeat(3, 1fr);','CSS Grid'],['transition','transition: 0.2s ease;','Animation'],
  ['media','@media (max-width: 768px) {\n  \n}','Responsive rule']
];
const JS_SNIPPETS = [
  ['console.log','console.log();','JavaScript'],['const','const name = value;','Variable'],['let','let value = 0;','Variable'],
  ['function','function name() {\n  \n}','Function'],['arrow','const name = () => {\n  \n};','Arrow function'],
  ['querySelector','document.querySelector(\'selector\');','DOM'],['querySelectorAll','document.querySelectorAll(\'selector\');','DOM'],
  ['getElementById','document.getElementById(\'id\');','DOM'],['addEventListener','element.addEventListener(\'click\', () => {\n  \n});','Event'],
  ['if','if (condition) {\n  \n}','Condition'],['if-else','if (condition) {\n  \n} else {\n  \n}','Condition'],
  ['for','for (let i = 0; i < items.length; i++) {\n  \n}','Loop'],['forEach','items.forEach((item) => {\n  \n});','Loop'],
  ['fetch','fetch(url)\n  .then(response => response.json())\n  .then(data => console.log(data))\n  .catch(error => console.error(error));','Network'],
  ['async','async function name() {\n  try {\n    \n  } catch (error) {\n    console.error(error);\n  }\n}','Async function']
];

function escCode(value){
  return String(value).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
}
function token(cls, value){ return '<span class="tok-'+cls+'">'+escCode(value)+'</span>'; }

function highlightJS(code){
  const keywords = new Set(['const','let','var','function','return','if','else','for','while','do','switch','case','break','continue','new','class','extends','import','from','export','default','async','await','try','catch','finally','throw','typeof','instanceof','in','of','this','super','static','get','set','yield','delete','void']);
  const builtins = new Set(['document','window','console','Math','JSON','Date','Array','Object','String','Number','Boolean','Promise','Set','Map','localStorage','sessionStorage','fetch','URL','RegExp']);
  const constants = new Set(['true','false','null','undefined','NaN','Infinity']);
  let out='', i=0;
  while(i<code.length){
    const ch=code[i], next=code[i+1];
    if(ch==='/' && next==='/'){
      let j=code.indexOf('\n',i); if(j<0) j=code.length;
      out+=token('comment',code.slice(i,j)); i=j; continue;
    }
    if(ch==='/' && next==='*'){
      let j=code.indexOf('*/',i+2); j=j<0?code.length:j+2;
      out+=token('comment',code.slice(i,j)); i=j; continue;
    }
    if(ch==='"' || ch==="'" || ch==='`'){
      const q=ch; let j=i+1;
      while(j<code.length){ if(code[j]==='\\'){j+=2;continue;} if(code[j]===q){j++;break;} j++; }
      out+=token('string',code.slice(i,j)); i=j; continue;
    }
    if(/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(next||''))){
      let j=i+1; while(j<code.length && /[\w.xobA-Fa-f]/.test(code[j])) j++;
      out+=token('number',code.slice(i,j)); i=j; continue;
    }
    if(/[A-Za-z_$]/.test(ch)){
      let j=i+1; while(j<code.length && /[\w$]/.test(code[j])) j++;
      const word=code.slice(i,j); let k=j; while(/\s/.test(code[k]||'')) k++;
      if(keywords.has(word)) out+=token('keyword',word);
      else if(constants.has(word)) out+=token(word==='true'||word==='false'?'boolean':'constant',word);
      else if(builtins.has(word)) out+=token('builtin',word);
      else if(code[k]==='(') out+=token('function',word);
      else out+=escCode(word);
      i=j; continue;
    }
    if(/[+\-*%=!<>?&|~^]/.test(ch)) out+=token('operator',ch); else if(/[{}()[\].,;:]/.test(ch)) out+=token('punctuation',ch); else out+=escCode(ch);
    i++;
  }
  return out;
}

function highlightCSS(code){
  let out='', i=0, depth=0;
  while(i<code.length){
    const ch=code[i], next=code[i+1];
    if(ch==='/' && next==='*'){
      let j=code.indexOf('*/',i+2); j=j<0?code.length:j+2;
      out+=token('comment',code.slice(i,j)); i=j; continue;
    }
    if(ch==='"' || ch==="'"){
      const q=ch; let j=i+1; while(j<code.length){if(code[j]==='\\'){j+=2;continue;}if(code[j]===q){j++;break;}j++;}
      out+=token('string',code.slice(i,j));i=j;continue;
    }
    if(ch==='#' && /[0-9A-Fa-f]/.test(next||'')){
      let j=i+1;while(j<code.length && /[0-9A-Fa-f]/.test(code[j]))j++;
      out+=token('number',code.slice(i,j));i=j;continue;
    }
    if(/[0-9]/.test(ch) || (ch==='.' && /[0-9]/.test(next||''))){
      let j=i+1;while(j<code.length && /[0-9A-Za-z.%_-]/.test(code[j]))j++;
      out+=token('number',code.slice(i,j));i=j;continue;
    }
    if(ch==='@'){
      let j=i+1;while(j<code.length && /[\w-]/.test(code[j]))j++;
      out+=token('keyword',code.slice(i,j));i=j;continue;
    }
    if(/[A-Za-z_-]/.test(ch)){
      let j=i+1;while(j<code.length && /[\w-]/.test(code[j]))j++;
      const word=code.slice(i,j);let k=j;while(/\s/.test(code[k]||''))k++;
      const before=code.slice(0,i).trimEnd().slice(-1);
      if(word.startsWith('--')) out+=token('variable',word);
      else if(depth>0 && code[k]===':') out+=token('property',word);
      else if(depth===0 || before==='.' || before==='#' || before==='>' || before==='+' || before==='~') out+=token('selector',word);
      else out+=token('string',word);
      i=j;continue;
    }
    if(ch==='{') depth++; if(ch==='}') depth=Math.max(0,depth-1);
    if(/[{}();,:>+~\[\]=]/.test(ch)) out+=token('punctuation',ch); else out+=escCode(ch);
    i++;
  }
  return out;
}

function findTagEnd(code,start){
  let quote=null;
  for(let i=start+1;i<code.length;i++){
    const ch=code[i];
    if(quote){if(ch==='\\')i++;else if(ch===quote)quote=null;}
    else if(ch==='"'||ch==="'")quote=ch;else if(ch==='>')return i;
  }
  return code.length-1;
}
function highlightHTMLTag(raw){
  let out='',i=0;
  if(raw[i]==='<'){out+=token('punctuation','<');i++;}
  if(raw[i]==='/'){out+=token('punctuation','/');i++;}
  if(raw[i]==='!'){
    return token('doctype',raw);
  }
  while(i<raw.length && /\s/.test(raw[i])){out+=escCode(raw[i]);i++;}
  let j=i;while(j<raw.length && /[\w:-]/.test(raw[j]))j++;
  if(j>i){out+=token('tag',raw.slice(i,j));i=j;}
  while(i<raw.length){
    const ch=raw[i];
    if(ch==='"'||ch==="'"){
      const q=ch;let k=i+1;while(k<raw.length){if(raw[k]==='\\')k+=2;else if(raw[k]===q){k++;break;}else k++;}
      out+=token('string',raw.slice(i,k));i=k;continue;
    }
    if(/[A-Za-z_:]/.test(ch)){
      let k=i+1;while(k<raw.length && /[\w:.-]/.test(raw[k]))k++;
      out+=token('attr',raw.slice(i,k));i=k;continue;
    }
    if(ch==='=')out+=token('operator',ch);else if(ch==='>'||ch==='/')out+=token('punctuation',ch);else out+=escCode(ch);
    i++;
  }
  return out;
}
function highlightHTML(code){
  let out='',i=0;
  while(i<code.length){
    if(code.startsWith('<!--',i)){
      let j=code.indexOf('-->',i+4);j=j<0?code.length:j+3;
      out+=token('comment',code.slice(i,j));i=j;continue;
    }
    if(code[i]==='<'){
      const end=findTagEnd(code,i);const raw=code.slice(i,end+1);const match=raw.match(/^<\s*([A-Za-z][\w:-]*)/);const tagName=match?match[1].toLowerCase():'';
      out+=highlightHTMLTag(raw);i=end+1;
      if(tagName==='style' || tagName==='script'){
        const close='</'+tagName+'>';const closeAt=code.toLowerCase().indexOf(close,i);
        if(closeAt>=0){
          const inner=code.slice(i,closeAt);out+=tagName==='style'?highlightCSS(inner):highlightJS(inner);
          out+=highlightHTMLTag(code.slice(closeAt,closeAt+close.length));i=closeAt+close.length;
        }
      }
      continue;
    }
    let j=code.indexOf('<',i);if(j<0)j=code.length;
    out+='<span class="tok-text">'+escCode(code.slice(i,j))+'</span>';i=j;
  }
  return out;
}
function highlightCode(code,lang){
  if(lang==='html') return highlightHTML(code);
  if(lang==='css') return highlightCSS(code);
  if(lang==='javascript' || lang==='typescript') return highlightJS(code);
  if(lang==='json') return highlightJS(code);
  return escCode(code);
}

function findUnclosedHTMLTag(source){
  const stack=[]; const rx=/<\/?([A-Za-z][\w:-]*)\b[^>]*>/g; let m;
  while((m=rx.exec(source))){
    const full=m[0],name=m[1].toLowerCase();
    if(full.startsWith('</')){
      const at=stack.lastIndexOf(name); if(at>=0) stack.splice(at,1);
    }else if(!full.endsWith('/>') && !HTML_VOID_TAGS.has(name)) stack.push(name);
  }
  return stack[stack.length-1]||'';
}
function currentWord(ta){
  const before=ta.value.slice(0,ta.selectionStart);const m=before.match(/[A-Za-z_$-][\w$-]*$/);return m?m[0]:'';
}
function suggestionsFor(ta,lang){
  const before=ta.value.slice(0,ta.selectionStart);const word=currentWord(ta);const items=[];
  if(lang==='html'){
    if(/(?:^|\s)html$/i.test(before)) items.push({label:'HTML5 document',detail:'Complete page structure',kind:'snippet',insert:'<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>',replace:4,caretBack:17});
    if(/!$/.test(before)) items.push({label:'!',detail:'HTML5 boilerplate',kind:'snippet',insert:'<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>',replace:1,caretBack:17});
    const closeMatch=before.match(/<\/([\w-]*)$/);
    if(closeMatch){
      const open=findUnclosedHTMLTag(before.slice(0,before.length-closeMatch[0].length));
      if(open && open.startsWith(closeMatch[1].toLowerCase())) items.push({label:'</'+open+'>',detail:'Close nearest open tag',kind:'tag',insert:'</'+open+'>',replace:closeMatch[0].length});
    }else{
      const tagMatch=before.match(/<([\w-]*)$/);
      if(tagMatch){
        const q=tagMatch[1].toLowerCase();
        HTML_TAGS.filter(t=>t.startsWith(q)).slice(0,12).forEach(t=>{
          const insert=HTML_VOID_TAGS.has(t)?'<'+t+'>':'<'+t+'></'+t+'>';
          items.push({label:insert,detail:HTML_VOID_TAGS.has(t)?'HTML element':'Paired HTML element',kind:'tag',insert,replace:tagMatch[0].length,caretBack:HTML_VOID_TAGS.has(t)?0:t.length+3});
        });
      }else if(word.length>=2){
        HTML_TAGS.filter(t=>t.startsWith(word.toLowerCase())).slice(0,8).forEach(t=>items.push({label:'<'+t+'>',detail:'HTML element',kind:'tag',insert:HTML_VOID_TAGS.has(t)?'<'+t+'>':'<'+t+'></'+t+'>',replace:word.length,caretBack:HTML_VOID_TAGS.has(t)?0:t.length+3}));
      }
    }
  }else if(lang==='css'){
    if(word.length>=1) CSS_SNIPPETS.filter(x=>x[0].startsWith(word.toLowerCase())).slice(0,10).forEach(x=>items.push({label:x[0],detail:x[2],kind:'css',insert:x[1],replace:word.length,caretBack:x[1].includes('\n  \n')?2:0}));
  }else if(lang==='javascript' || lang==='typescript'){
    if(word.length>=1) JS_SNIPPETS.filter(x=>x[0].toLowerCase().startsWith(word.toLowerCase())).slice(0,10).forEach(x=>items.push({label:x[0],detail:x[2],kind:'js',insert:x[1],replace:word.length,caretBack:x[1].includes('\n  \n')?2:(x[1].endsWith(');')?2:0)}));
  }
  return items;
}

function renderEditor(){
  renderTabs();
  editorWrap.innerHTML = '';
  currentAutocomplete = null;
  if(!activeFile){
    editorTopline.textContent = '';
    languageStatus.textContent = 'Plain Text';
    editorWrap.innerHTML = '<div class="editor-empty">no file open — create or upload one</div>';
    return;
  }
  const info = typeInfo(activeFile);
  languageStatus.textContent = info.lang.charAt(0).toUpperCase() + info.lang.slice(1);
  editorTopline.innerHTML = '<span class="sq" style="background:'+info.color+'"></span> '+escapeHTML(activeFile)+' <span style="color:var(--text-faint)">&middot; '+info.lang+'</span><span class="editor-help"><strong>Tab/Enter</strong> accept suggestion · <strong>Ctrl/Cmd + Enter</strong> compile</span>';

  if(info.binary){
    const wrap = document.createElement('div');
    wrap.className = 'binary-note';
    if(info.lang === 'image') wrap.innerHTML = '<img src="'+files[activeFile].content+'" alt="'+activeFile+'"><span>binary file — preview only</span>';
    else wrap.textContent = 'binary file — no text preview';
    editorWrap.appendChild(wrap);
    return;
  }

  const editingPath = activeFile;
  const ln = document.createElement('div');
  ln.className = 'line-numbers';
  const stage=document.createElement('div');stage.className='code-stage';
  const syntax=document.createElement('div');syntax.className='syntax-layer';
  const code=document.createElement('pre');code.className='syntax-code';
  syntax.appendChild(code);
  const ta = document.createElement('textarea');
  ta.className='code-input';
  ta.spellcheck = false; ta.autocapitalize = 'off'; ta.autocomplete = 'off'; ta.autocorrect = 'off';
  ta.setAttribute('aria-label', 'Code editor for ' + editingPath);
  ta.value = files[editingPath].content;
  const popup=document.createElement('div');popup.className='autocomplete';popup.setAttribute('role','listbox');
  stage.appendChild(syntax);stage.appendChild(ta);stage.appendChild(popup);
  currentTextarea = ta; currentAutocomplete=popup;
  let suggestionItems=[],selectedSuggestion=0;
  let renderedLineCount = 0;
  let visualFrame = 0;

  function updateLn(){
    const lines = ta.value.split('\n').length;
    if(lines === renderedLineCount) return;
    renderedLineCount = lines;
    let out = '';
    for(let i=1;i<=lines;i++) out += i + '\n';
    ln.textContent = out.trim();
  }
  function updateCursor(){
    const before = ta.value.slice(0, ta.selectionStart); const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n'); cursorStatus.textContent = 'Ln ' + line + ', Col ' + col;
  }
  function updateSyntax(){
    const plainMode = ta.value.length > 120000;
    stage.classList.toggle('plain-mode', plainMode);
    code.innerHTML = plainMode ? '' : highlightCode(ta.value,info.lang)+(ta.value.endsWith('\n')?'\n':'');
    syncScroll();
  }
  function syncScroll(){ code.style.transform='translate3d('+(-ta.scrollLeft)+'px,'+(-ta.scrollTop)+'px,0)'; ln.scrollTop=ta.scrollTop; }
  function refreshVisuals(){ visualFrame=0;updateLn();updateCursor();updateSyntax(); }
  function persist(){
    if(!files[editingPath]) return;
    files[editingPath].content=ta.value;
    if(!visualFrame) visualFrame=requestAnimationFrame(refreshVisuals);
    scheduleRun(editingPath);
    scheduleSave();
  }
  function closeSuggestions(){popup.classList.remove('open');popup.innerHTML='';suggestionItems=[];selectedSuggestion=0;}
  function popupPosition(){
    const before=ta.value.slice(0,ta.selectionStart);const lines=before.split('\n');const line=lines.length-1,col=lines[lines.length-1].length;
    const cs=getComputedStyle(ta);const lh=parseFloat(cs.lineHeight)||21;const charW=(parseFloat(cs.fontSize)||13)*.61;
    const x=Math.max(8,Math.min(stage.clientWidth-340,parseFloat(cs.paddingLeft)+col*charW-ta.scrollLeft));
    const y=Math.max(8,Math.min(stage.clientHeight-110,parseFloat(cs.paddingTop)+(line+1)*lh-ta.scrollTop));
    popup.style.left=x+'px';popup.style.top=y+'px';
  }
  function drawSuggestions(){
    suggestionItems=suggestionsFor(ta,info.lang);selectedSuggestion=0;
    if(!suggestionItems.length){closeSuggestions();return;}
    popup.innerHTML='';
    suggestionItems.forEach((item,index)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='suggestion'+(index===0?' active':'');
      btn.innerHTML='<span class="suggestion-main"><span class="suggestion-label">'+escapeHTML(item.label)+'</span><span class="suggestion-detail">'+escapeHTML(item.detail)+'</span></span><span class="suggestion-kind">'+escapeHTML(item.kind)+'</span>';
      btn.addEventListener('pointerdown',e=>{e.preventDefault();acceptSuggestion(index);});popup.appendChild(btn);
    });
    popupPosition();popup.classList.add('open');
  }
  function chooseSuggestion(index){
    if(!suggestionItems.length)return;selectedSuggestion=(index+suggestionItems.length)%suggestionItems.length;
    [...popup.children].forEach((el,i)=>el.classList.toggle('active',i===selectedSuggestion));
    popup.children[selectedSuggestion]?.scrollIntoView({block:'nearest'});
  }
  function acceptSuggestion(index=selectedSuggestion){
    const item=suggestionItems[index];if(!item)return false;
    const end=ta.selectionStart,start=Math.max(0,end-(item.replace||0));ta.setRangeText(item.insert,start,end,'end');
    if(item.caretBack){const pos=ta.selectionStart-item.caretBack;ta.setSelectionRange(pos,pos);}
    closeSuggestions();persist();ta.focus();return true;
  }
  function insertPair(open,close){
    const start=ta.selectionStart,end=ta.selectionEnd,selected=ta.value.slice(start,end);
    ta.setRangeText(open+selected+close,start,end,'end');const pos=start+open.length+(selected?selected.length:0);ta.setSelectionRange(pos,pos);persist();
  }
  function autoCloseHTMLTag(e){
    if(info.lang!=='html' || e.key!=='>')return false;
    const before=ta.value.slice(0,ta.selectionStart);const m=before.match(/<([A-Za-z][\w:-]*)(?:\s[^<>]*)?$/);
    if(!m || before.endsWith('/') || HTML_VOID_TAGS.has(m[1].toLowerCase()))return false;
    e.preventDefault();const tag=m[1];const pos=ta.selectionStart;ta.setRangeText('></'+tag+'>',pos,pos,'end');ta.setSelectionRange(pos+1,pos+1);persist();return true;
  }

  updateLn();updateCursor();updateSyntax();
  ta.addEventListener('input',()=>{persist();drawSuggestions();});
  ta.addEventListener('scroll',()=>{syncScroll();if(popup.classList.contains('open'))popupPosition();});
  ['click','keyup','select'].forEach(eventName=>ta.addEventListener(eventName,()=>{updateCursor();if(eventName==='click')drawSuggestions();}));
  ta.addEventListener('blur',()=>setTimeout(closeSuggestions,120));
  ta.addEventListener('keydown',e=>{
    if(popup.classList.contains('open')){
      if(e.key==='ArrowDown'){e.preventDefault();chooseSuggestion(selectedSuggestion+1);return;}
      if(e.key==='ArrowUp'){e.preventDefault();chooseSuggestion(selectedSuggestion-1);return;}
      if(e.key==='Enter' || e.key==='Tab'){e.preventDefault();acceptSuggestion();return;}
      if(e.key==='Escape'){e.preventDefault();closeSuggestions();return;}
    }
    if(autoCloseHTMLTag(e))return;
    const pairs={'(' : ')','[':']','{':'}','"':'"',"'":"'",'`':'`'};
    if(pairs[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey){
      const next=ta.value[ta.selectionStart];
      if((e.key==='"'||e.key==="'"||e.key==='`') && next===e.key && ta.selectionStart===ta.selectionEnd){e.preventDefault();ta.setSelectionRange(ta.selectionStart+1,ta.selectionStart+1);return;}
      e.preventDefault();insertPair(e.key,pairs[e.key]);return;
    }
    if([')',']','}'].includes(e.key) && ta.value[ta.selectionStart]===e.key && ta.selectionStart===ta.selectionEnd){e.preventDefault();ta.setSelectionRange(ta.selectionStart+1,ta.selectionStart+1);return;}
    if(e.key==='Enter'){
      const start=ta.selectionStart,end=ta.selectionEnd;const before=ta.value.slice(0,start);const line=before.slice(before.lastIndexOf('\n')+1);const indent=(line.match(/^\s*/)||[''])[0];
      const prev=ta.value[start-1],next=ta.value[start];
      if((prev==='{'&&next==='}')||(prev==='['&&next===']')||(prev==='('&&next===')')){
        e.preventDefault();const inner=indent+'  ';ta.setRangeText('\n'+inner+'\n'+indent,start,end,'end');ta.setSelectionRange(start+1+inner.length,start+1+inner.length);persist();return;
      }
      if(indent){e.preventDefault();ta.setRangeText('\n'+indent,start,end,'end');persist();return;}
    }
    if(e.key === 'Tab'){
      e.preventDefault();const start=ta.selectionStart,end=ta.selectionEnd;ta.setRangeText('  ',start,end,'end');persist();
    }
  });

  editorWrap.appendChild(ln);editorWrap.appendChild(stage);
}

/* ---------------- new file ---------------- */
document.getElementById('newFileBtn').addEventListener('click', () => {
  const name = normalizeUserPath(prompt('New file name (use / for folders, e.g. css/about.css)'));
  if(!name) return;
  if(files[name]){ alert('A file with that path already exists.'); return; }
  files[name] = {content:'', binary:false};
  activeFile = name;
  touchTab(name);
  renderFileList();
  renderEditor();
  scheduleRun();
  scheduleSave();
  if(isMobileLayout()) setMobileView('editor');
  setTimeout(() => currentTextarea && currentTextarea.focus(), 0);
});

/* ---------------- ingesting files (click upload, folder upload, drag & drop) ---------------- */
function ingestEntries(entries){
  if(!entries.length) return;
  const workspaceEntry = entries.find(({path}) => extOf(path) === 'kmdspace');
  if(workspaceEntry){
    importWorkspaceFile(workspaceEntry.file);
    return;
  }
  let remaining = entries.length;
  let lastPath = null;
  entries.forEach(({file, path}) => {
    const info = typeInfo(path);
    const reader = new FileReader();
    reader.onload = () => {
      files[path] = {content: reader.result, binary: !!info.binary};
      remaining--;
      lastPath = path;
      if(remaining === 0){
        activeFile = lastPath;
        renderFileList();
        renderEditor();
        scheduleRun();
        scheduleSave();
        if(isMobileLayout()) setMobileView('editor');
      }
    };
    if(info.binary) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function importWorkspaceFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const bundle = JSON.parse(reader.result);
      if(!bundle || bundle.format !== 'kmdlabs-codespace' || !bundle.files || typeof bundle.files !== 'object') throw new Error('Invalid workspace');
      files = bundle.files;
      collapsedFolders = new Set();
      activeFile = bundle.activeFile && files[bundle.activeFile] ? bundle.activeFile : Object.keys(files)[0] || null;
      openTabs = Array.isArray(bundle.openTabs) ? bundle.openTabs.filter(path => files[path]) : (activeFile ? [activeFile] : []);
      renderFileList();
      renderEditor();
      scheduleRun();
      saveWorkspace();
      showToast('Workspace imported — '+Object.keys(files).length+' files ready.');
    }catch(error){
      alert('That file is not a valid CodeSpace workspace.');
    }
  };
  reader.readAsText(file);
}
function filesToEntries(fileListObj){
  return Array.from(fileListObj).map(f => ({
    file: f,
    path: (f.webkitRelativePath && f.webkitRelativePath.length) ? f.webkitRelativePath : f.name
  }));
}

const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
document.getElementById('uploadBtn').addEventListener('click', () => fileInput.click());
document.getElementById('uploadFolderBtn').addEventListener('click', () => folderInput.click());
fileInput.addEventListener('change', () => { ingestEntries(filesToEntries(fileInput.files)); fileInput.value=''; });
folderInput.addEventListener('change', () => { ingestEntries(filesToEntries(folderInput.files)); folderInput.value=''; });

/* drag & drop, including whole folders */
function traverseEntry(entry, prefix, out){
  return new Promise(resolve => {
    if(entry.isFile){
      entry.file(file => {
        out.push({file, path: prefix ? prefix+'/'+entry.name : entry.name});
        resolve();
      }, () => resolve());
    } else if(entry.isDirectory){
      const reader = entry.createReader();
      const readAll = () => {
        reader.readEntries(async entries => {
          if(!entries.length){ resolve(); return; }
          const newPrefix = prefix ? prefix+'/'+entry.name : entry.name;
          await Promise.all(entries.map(e2 => traverseEntry(e2, newPrefix, out)));
          readAll();
        }, () => resolve());
      };
      readAll();
    } else {
      resolve();
    }
  });
}

const sidebar = document.getElementById('sidebar');
['dragenter','dragover'].forEach(ev => sidebar.addEventListener(ev, e => {
  e.preventDefault();
  sidebar.classList.add('dragover');
}));
['dragleave'].forEach(ev => sidebar.addEventListener(ev, e => {
  e.preventDefault();
  sidebar.classList.remove('dragover');
}));
sidebar.addEventListener('drop', e => {
  e.preventDefault();
  sidebar.classList.remove('dragover');
  const dt = e.dataTransfer;
  if(dt.items && dt.items.length && dt.items[0].webkitGetAsEntry){
    const rootEntries = [];
    for(let i=0;i<dt.items.length;i++){
      const entry = dt.items[i].webkitGetAsEntry && dt.items[i].webkitGetAsEntry();
      if(entry) rootEntries.push(entry);
    }
    if(rootEntries.length){
      const collected = [];
      Promise.all(rootEntries.map(en => traverseEntry(en, '', collected))).then(() => {
        ingestEntries(collected);
      });
      return;
    }
  }
  if(dt.files && dt.files.length) ingestEntries(filesToEntries(dt.files));
});

/* ---------------- workbench navigation and search ---------------- */
const explorerPanel = document.getElementById('explorerPanel');
const searchPanel = document.getElementById('searchPanel');
const projectSearchInput = document.getElementById('projectSearchInput');
const projectSearchForm = document.getElementById('projectSearchForm');
const searchResults = document.getElementById('searchResults');
const searchSummary = document.getElementById('searchSummary');

function setSidePanel(panel){
  const searchOpen = panel === 'search';
  explorerPanel.classList.toggle('active', !searchOpen);
  searchPanel.classList.toggle('active', searchOpen);
  document.querySelectorAll('[data-side-panel]').forEach(button => button.classList.toggle('active', button.dataset.sidePanel === panel));
  if(isMobileLayout()) setMobileView('files');
  if(searchOpen) setTimeout(() => projectSearchInput.focus(), 0);
}

document.querySelectorAll('[data-side-panel]').forEach(button => button.addEventListener('click', () => setSidePanel(button.dataset.sidePanel)));

function highlightedExcerpt(text, query){
  const safe = escapeHTML(text.trim());
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if(index < 0) return safe;
  const start = Math.max(0,index - 32);
  const end = Math.min(text.length,index + query.length + 58);
  const excerpt = (start ? '…' : '') + text.slice(start,end) + (end < text.length ? '…' : '');
  const escaped = escapeHTML(excerpt);
  return escaped.replace(new RegExp(escapeRegExp(escapeHTML(query)),'ig'), match => '<mark>'+match+'</mark>');
}

function escapeRegExp(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function searchProject(query){
  const needle = query.trim().toLowerCase();
  searchResults.innerHTML = '';
  if(!needle){ searchSummary.textContent = 'Search filenames and file contents.'; return; }
  const matches = [];
  Object.keys(files).sort().forEach(path => {
    if(path.toLowerCase().includes(needle)) matches.push({path,line:1,text:path,kind:'filename'});
    if(files[path].binary) return;
    String(files[path].content).split('\n').forEach((line,index) => {
      if(matches.length < 100 && line.toLowerCase().includes(needle)) matches.push({path,line:index+1,text:line,kind:'content'});
    });
  });
  searchSummary.textContent = matches.length + (matches.length === 1 ? ' result' : ' results') + (matches.length >= 100 ? ' · showing first 100' : '');
  matches.slice(0,100).forEach(match => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    button.innerHTML = '<strong>'+escapeHTML(match.path)+(match.kind === 'content' ? ':'+match.line : '')+'</strong><span>'+highlightedExcerpt(match.text,query)+'</span>';
    button.addEventListener('click', () => {
      openFile(match.path,{line:match.line});
      if(isMobileLayout()) setMobileView('editor');
    });
    searchResults.appendChild(button);
  });
  if(!matches.length) searchResults.innerHTML = '<div class="editor-empty">no results</div>';
}

projectSearchForm?.addEventListener('submit', event => { event.preventDefault(); searchProject(projectSearchInput.value); });
projectSearchInput?.addEventListener('input', () => searchProject(projectSearchInput.value));

/* ---------------- auto-run toggle ---------------- */
let autoRun = savedSettings.autoRun !== false;
const autoToggle = document.getElementById('autoToggle');
autoToggle.classList.toggle('on', autoRun);
autoToggle.addEventListener('click', () => {
  autoRun = !autoRun;
  autoToggle.classList.toggle('on', autoRun);
  if(autoRun && previewOpen) compile(true);
  scheduleSave();
  showToast('Auto-run '+(autoRun ? 'enabled' : 'paused')+'.');
});

let compileTimer = 0;
let compileFrame = 0;
let pendingChangedPath = null;
const FAST_COMPILE_DELAY = 90;

function scheduleRun(changedPath = null){
  if(!autoRun || !previewOpen) return;
  if(pendingChangedPath !== null && pendingChangedPath !== changedPath) pendingChangedPath = '';
  else if(pendingChangedPath === null) pendingChangedPath = changedPath || '';
  clearTimeout(compileTimer);
  if(compileFrame) cancelAnimationFrame(compileFrame);
  compileTimer = setTimeout(() => {
    compileFrame = requestAnimationFrame(() => {
      const path = pendingChangedPath;
      pendingChangedPath = null;
      compileFrame = 0;
      if(path && typeInfo(path).lang === 'css' && applyFastCssUpdate(path)) return;
      compile(false);
    });
  }, FAST_COMPILE_DELAY);
}

/* ---------------- responsive workspace views ---------------- */
const previewPane = document.getElementById('previewPane');
const mobileMedia = window.matchMedia('(max-width: 820px)');
let previewOpen = false;

function isMobileLayout(){
  return mobileMedia.matches;
}
function setMobileView(view){
  document.body.dataset.mobileView = view;
  if(view !== 'files') setFileManageMode(false);
  document.querySelectorAll('.mobile-dock [data-mobile-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.mobileView === view);
  });
}
function openPreview(){
  previewOpen = true;
  previewPane.classList.remove('closed');
  if(isMobileLayout()) setMobileView('preview');
  compile(true);
  scheduleSave();
}
function closePreview(){
  if(isMobileLayout()){
    setMobileView('editor');
    return;
  }
  previewOpen = false;
  previewPane.classList.add('closed');
  scheduleSave();
}

document.querySelectorAll('.mobile-dock [data-mobile-view]').forEach(button => {
  button.addEventListener('click', () => {
    const view = button.dataset.mobileView;
    if(view === 'preview') openPreview();
    else setMobileView(view);
  });
});
mobileMedia.addEventListener?.('change', event => {
  if(event.matches){
    setMobileView(document.body.dataset.mobileView || 'editor');
  }else{
    document.body.removeAttribute('data-mobile-view');
  }
});
if(isMobileLayout()) setMobileView('editor');

document.getElementById('openCompilerBtn').addEventListener('click', openPreview);
document.getElementById('closeCompilerBtn').addEventListener('click', closePreview);
document.getElementById('runBtn').addEventListener('click', () => {
  if(isMobileLayout()) openPreview();
  else if(!previewOpen) openPreview();
  else compile(true);
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if(!confirm('Reset the workspace back to the starter files? This clears uploads.')) return;
  loadDefaults();
  renderFileList();
  renderEditor();
  saveWorkspace();
  if(previewOpen) compile();
  if(isMobileLayout()) setMobileView('editor');
});

/* ---------------- console capture ---------------- */
const consoleBody = document.getElementById('consoleBody');
document.getElementById('clearConsole').addEventListener('click', () => {
  consoleBody.innerHTML = '<div class="console-empty">// output will appear here</div>';
});
function logToPanel(type, args){
  const empty = consoleBody.querySelector('.console-empty');
  if(empty) empty.remove();
  const line = document.createElement('div');
  line.className = 'console-line ' + type;
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = type === 'error' ? 'err' : type === 'warn' ? 'warn' : 'log';
  const msg = document.createElement('span');
  msg.textContent = args.map(a => {
    try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
    catch(e){ return String(a); }
  }).join(' ');
  line.appendChild(tag);
  line.appendChild(msg);
  consoleBody.appendChild(line);
  consoleBody.scrollTop = consoleBody.scrollHeight;
}
window.addEventListener('message', e => {
  if(e.source === document.getElementById('preview').contentWindow && e.data && e.data.__kegodev_console){
    logToPanel(e.data.level, e.data.args);
  }
});

const consolePanel = document.getElementById('consolePanel');
document.getElementById('toggleConsoleBtn').addEventListener('click', () => {
  consolePanel.classList.toggle('collapsed');
  scheduleSave();
});

const previewStage = document.getElementById('previewStage');
document.querySelectorAll('[data-preview-size]').forEach(button => {
  button.addEventListener('click', () => {
    const size = button.dataset.previewSize;
    previewStage.classList.remove('device-desktop','device-tablet','device-mobile');
    if(size !== 'desktop') previewStage.classList.add('device-' + size);
    document.querySelectorAll('[data-preview-size]').forEach(item => item.classList.toggle('active', item === button));
  });
});

function activeFileBlob(){
  if(!activeFile || !files[activeFile]) return null;
  const file = files[activeFile];
  if(file.binary && String(file.content).startsWith('data:')){
    const parts = file.content.split(',');
    const meta = parts[0];
    const bytes = meta.includes(';base64') ? atob(parts[1]) : decodeURIComponent(parts[1]);
    const array = new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++) array[i] = bytes.charCodeAt(i);
    return new Blob([array], {type:(meta.match(/^data:([^;,]+)/)||[])[1] || 'application/octet-stream'});
  }
  return new Blob([file.content], {type:'text/plain;charset=utf-8'});
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.getElementById('downloadBtn').addEventListener('click', () => {
  const blob = activeFileBlob();
  if(!blob){ alert('Open a file before downloading.'); return; }
  downloadBlob(blob, basename(activeFile));
  showToast('Downloaded '+basename(activeFile)+'.');
});

function exportWorkspace(){
  const bundle = {
    format:'kmdlabs-codespace',
    version:1,
    exportedAt:new Date().toISOString(),
    activeFile,
    openTabs,
    files
  };
  downloadBlob(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),'kmdlabs-workspace.kmdspace');
  showToast('Portable workspace exported.');
}

document.getElementById('openNewTabBtn').addEventListener('click', () => {
  compile(true);
  const source = document.getElementById('preview').srcdoc;
  if(!source) return;
  const url = URL.createObjectURL(new Blob([source], {type:'text/html'}));
  const opened = window.open(url, '_blank', 'noopener');
  if(!opened) alert('Allow pop-ups to open the preview in a new tab.');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

/* ---------------- command palette ---------------- */
const commandPalette = document.getElementById('commandPalette');
const paletteInput = document.getElementById('paletteInput');
const paletteResults = document.getElementById('paletteResults');
const shortcutDialog = document.getElementById('shortcutDialog');
const toast = document.getElementById('toast');
let paletteMode = 'commands';
let paletteItems = [];
let selectedPaletteIndex = 0;
let toastTimer = 0;

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function showShortcuts(){
  closePalette();
  shortcutDialog.classList.add('open');
  shortcutDialog.setAttribute('aria-hidden','false');
}
function closeShortcuts(){
  shortcutDialog.classList.remove('open');
  shortcutDialog.setAttribute('aria-hidden','true');
}
document.querySelectorAll('[data-close-shortcuts]').forEach(button => button.addEventListener('click', closeShortcuts));

function commands(){
  return [
    {label:'File: New File',hint:'Ctrl/⌘ N',run:()=>document.getElementById('newFileBtn').click()},
    {label:'File: Import Files or Workspace',hint:'',run:()=>fileInput.click()},
    {label:'File: Export Portable Workspace',hint:'.kmdspace',run:exportWorkspace},
    {label:'File: Download Active File',hint:'',run:()=>document.getElementById('downloadBtn').click()},
    {label:'View: Quick Open File',hint:'Ctrl/⌘ P',run:()=>openPalette('files')},
    {label:'View: Search Project',hint:'Ctrl/⌘ Shift F',run:()=>setSidePanel('search')},
    {label:'View: Toggle Console',hint:'',run:()=>document.getElementById('toggleConsoleBtn').click()},
    {label:'Run: Compile Preview',hint:'Ctrl/⌘ Enter',run:openPreview},
    {label:'Run: Toggle Auto-run',hint:autoRun?'On':'Off',run:()=>autoToggle.click()},
    {label:'Workspace: Save Now',hint:'Ctrl/⌘ S',run:()=>{saveWorkspace();showToast('Workspace saved in this browser.');}},
    {label:'Help: Keyboard Shortcuts',hint:'',run:showShortcuts}
  ];
}

function drawPalette(){
  const query = paletteInput.value.trim().toLowerCase();
  paletteItems = paletteMode === 'files'
    ? Object.keys(files).sort().filter(path => path.toLowerCase().includes(query)).map(path => ({label:path,hint:typeInfo(path).lang,run:()=>openFile(path)}))
    : commands().filter(command => command.label.toLowerCase().includes(query));
  selectedPaletteIndex = Math.min(selectedPaletteIndex, Math.max(0,paletteItems.length-1));
  paletteResults.innerHTML = '';
  paletteItems.forEach((item,index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-option' + (index === selectedPaletteIndex ? ' active' : '');
    button.setAttribute('role','option');
    button.setAttribute('aria-selected',String(index === selectedPaletteIndex));
    button.innerHTML = '<span>'+escapeHTML(item.label)+'</span><small>'+escapeHTML(item.hint || '')+'</small>';
    button.addEventListener('pointermove',()=>{selectedPaletteIndex=index;drawPaletteSelection();});
    button.addEventListener('click',()=>runPaletteItem(index));
    paletteResults.appendChild(button);
  });
  if(!paletteItems.length) paletteResults.innerHTML = '<div class="editor-empty">no matches</div>';
}

function drawPaletteSelection(){
  [...paletteResults.querySelectorAll('.palette-option')].forEach((button,index) => {
    button.classList.toggle('active',index === selectedPaletteIndex);
    button.setAttribute('aria-selected',String(index === selectedPaletteIndex));
  });
  paletteResults.querySelector('.palette-option.active')?.scrollIntoView({block:'nearest'});
}
function runPaletteItem(index=selectedPaletteIndex){
  const item = paletteItems[index];
  if(!item) return;
  closePalette();
  item.run();
}
function openPalette(mode='commands'){
  paletteMode = mode;
  selectedPaletteIndex = 0;
  paletteInput.value = '';
  paletteInput.placeholder = mode === 'files' ? 'Open a file by name…' : 'Type a command…';
  commandPalette.classList.add('open');
  commandPalette.setAttribute('aria-hidden','false');
  drawPalette();
  setTimeout(()=>paletteInput.focus(),0);
}
function closePalette(){
  commandPalette.classList.remove('open');
  commandPalette.setAttribute('aria-hidden','true');
}
document.getElementById('commandBtn').addEventListener('click',()=>openPalette());
document.getElementById('railCommandBtn').addEventListener('click',()=>openPalette());
document.querySelectorAll('[data-close-palette]').forEach(button=>button.addEventListener('click',closePalette));
paletteInput.addEventListener('input',()=>{selectedPaletteIndex=0;drawPalette();});
paletteInput.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'){event.preventDefault();selectedPaletteIndex=(selectedPaletteIndex+1)%Math.max(1,paletteItems.length);drawPaletteSelection();}
  if(event.key==='ArrowUp'){event.preventDefault();selectedPaletteIndex=(selectedPaletteIndex-1+Math.max(1,paletteItems.length))%Math.max(1,paletteItems.length);drawPaletteSelection();}
  if(event.key==='Enter'){event.preventDefault();runPaletteItem();}
});

document.addEventListener('keydown', event => {
  const command = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if(event.key === 'Escape'){
    if(commandPalette.classList.contains('open')) closePalette();
    if(shortcutDialog.classList.contains('open')) closeShortcuts();
  }
  if(command && key === 'p'){
    event.preventDefault();
    openPalette(event.shiftKey ? 'commands' : 'files');
    return;
  }
  if(command && event.shiftKey && key === 'f'){
    event.preventDefault();
    setSidePanel('search');
    return;
  }
  if(command && event.key === 'Enter'){
    event.preventDefault();
    openPreview();
  }
  if(command && key === 's'){
    event.preventDefault();
    saveWorkspace();
    showToast('Workspace saved in this browser.');
  }
  if(command && key === 'n'){
    event.preventDefault();
    document.getElementById('newFileBtn').click();
  }
});

/* ---------------- compiler ---------------- */
const previewNote = document.getElementById('previewNote');

function findEntryHtml(){
  if(files['index.html']) return 'index.html';
  const nested = Object.keys(files).find(p => basename(p) === 'index.html');
  if(nested) return nested;
  return Object.keys(files).find(p => typeInfo(p).lang === 'html') || null;
}

function normalizeParts(parts){
  const stack = [];
  parts.forEach(p => {
    if(p === '' || p === '.') return;
    if(p === '..') stack.pop();
    else stack.push(p);
  });
  return stack.join('/');
}

function resolveRef(entryPath, ref){
  if(!ref) return null;
  if(/^https?:\/\//i.test(ref) || ref.startsWith('//') || ref.startsWith('data:')) return null;
  let cleanRef = ref.split('#')[0].split('?')[0];
  let base = dirOf(entryPath);
  if(cleanRef.startsWith('/')){ base = ''; cleanRef = cleanRef.slice(1); }
  const combined = (base ? base.split('/') : []).concat(cleanRef.split('/'));
  const resolved = normalizeParts(combined);
  if(files[resolved]) return resolved;
  const bn = basename(cleanRef);
  const match = Object.keys(files).find(p => basename(p) === bn);
  return match || null;
}

function filesInEntryProject(entry, language){
  const entryDir = dirOf(entry);
  return Object.keys(files).filter(path => {
    if(path === entry || files[path].binary) return false;
    if(typeInfo(path).lang !== language) return false;

    // When index.html is inside an uploaded folder, only compile files from
    // that folder. A root index.html can use every file in the workspace.
    if(!entryDir) return true;
    return path.startsWith(entryDir + '/');
  });
}

function copyScriptAttributes(from, to){
  Array.from(from.attributes).forEach(attr => {
    const name = attr.name.toLowerCase();
    if(name === 'src' || name === 'integrity' || name === 'crossorigin') return;
    // defer has no effect on an inline classic script. Local scripts are
    // placed at the end of <body>, which gives the intended deferred timing.
    if(name === 'defer') return;
    to.setAttribute(attr.name, attr.value);
  });
}

function inlineCssAssets(cssText, cssPath){
  return String(cssText).replace(/url\(\s*(['"]?)([^'"\)]+)\1\s*\)/g, (full, quote, reference) => {
    const ref = reference.trim();
    if(!ref || ref.startsWith('data:') || ref.startsWith('#') || /^https?:/i.test(ref) || ref.startsWith('//')) return full;
    const match = resolveRef(cssPath, ref);
    if(!match || !files[match] || !files[match].binary) return full;
    return 'url("' + files[match].content + '")';
  });
}

let lastCompiledSource = '';
let lastCompileStartedAt = 0;

function flashCompileButton(){
  const button = document.getElementById('runBtn');
  button.classList.remove('compile-flash');
  void button.offsetWidth;
  button.classList.add('compile-flash');
}

function applyFastCssUpdate(path){
  const preview = document.getElementById('preview');
  if(!preview.contentWindow || !lastCompiledSource || !files[path]) return false;
  preview.contentWindow.postMessage({
    __kegodev_css_update:true,
    path:path,
    css:inlineCssAssets(files[path].content, path)
  }, '*');
  flashCompileButton();
  compileStatus.textContent = 'CSS hot update';
  return true;
}

function compile(force = false){
  const compileStartedAt = performance.now();
  lastCompileStartedAt = compileStartedAt;
  const entry = findEntryHtml();
  const preview = document.getElementById('preview');

  if(!entry){
    previewNote.textContent = 'No HTML file to preview. Add or upload an .html file to get started.';
    previewNote.classList.add('show');
    preview.srcdoc = '';
    compileStatus.textContent = 'No entry HTML';
    return;
  }

  const nonRunnable = Object.keys(files).filter(p => {
    const t = typeInfo(p);
    return !t.runnable && !t.binary && t.lang !== 'html';
  });
  if(nonRunnable.length){
    previewNote.textContent = 'Preview runs HTML/CSS/JS only — ' + nonRunnable.join(', ') + ' ' + (nonRunnable.length>1?'are':'is') + ' shown in the editor but not executed.';
    previewNote.classList.add('show');
  } else {
    previewNote.classList.remove('show');
  }

  const html = files[entry].content;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const includedCss = new Set();
  const includedJs = new Set();
  const localScripts = [];

  // Convert linked local stylesheets into inline CSS so they work in srcdoc.
  doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(link => {
    const match = resolveRef(entry, link.getAttribute('href'));
    if(!match || typeInfo(match).lang !== 'css') return;

    const style = doc.createElement('style');
    style.setAttribute('data-kegodev-source', match);
    style.textContent = inlineCssAssets(files[match].content, match);
    link.replaceWith(style);
    includedCss.add(match);
  });

  // Collect linked local scripts and execute them at the end of body. This
  // prevents scripts placed in <head> from running before their HTML exists.
  doc.querySelectorAll('script[src]').forEach(script => {
    const match = resolveRef(entry, script.getAttribute('src'));
    const lang = match ? typeInfo(match).lang : '';
    if(!match || lang !== 'javascript') return;

    const inline = doc.createElement('script');
    copyScriptAttributes(script, inline);
    if(extOf(match) === 'mjs' && !inline.getAttribute('type')) inline.type = 'module';
    inline.setAttribute('data-kegodev-source', match);
    inline.textContent = files[match].content;
    localScripts.push(inline);
    includedJs.add(match);
    script.remove();
  });

  // Automatically include standalone CSS files. Users therefore do not have
  // to manually add <link rel="stylesheet"> while learning or prototyping.
  filesInEntryProject(entry, 'css').forEach(path => {
    if(includedCss.has(path)) return;
    const style = doc.createElement('style');
    style.setAttribute('data-kegodev-source', path);
    style.textContent = inlineCssAssets(files[path].content, path);
    doc.head.appendChild(style);
    includedCss.add(path);
  });

  // Preserve uploaded assets used by HTML elements and CSS backgrounds.
  doc.querySelectorAll('img[src],source[src],video[src],audio[src],input[type="image"][src]').forEach(element => {
    const match = resolveRef(entry, element.getAttribute('src'));
    if(match && files[match].binary) element.setAttribute('src', files[match].content);
  });
  doc.querySelectorAll('video[poster]').forEach(video => {
    const match = resolveRef(entry, video.getAttribute('poster'));
    if(match && files[match].binary) video.setAttribute('poster', files[match].content);
  });
  doc.querySelectorAll('img[srcset],source[srcset]').forEach(element => {
    const rewritten = element.getAttribute('srcset').split(',').map(candidate => {
      const parts = candidate.trim().split(/\s+/);
      const match = resolveRef(entry, parts[0]);
      if(match && files[match].binary) parts[0] = files[match].content;
      return parts.join(' ');
    }).join(', ');
    element.setAttribute('srcset', rewritten);
  });

  const consoleShim = "(function(){var send=function(level){return function(){var args=Array.prototype.slice.call(arguments);parent.postMessage({__kegodev_console:true,level:level,args:args},'*');};};console.log=send('log');console.warn=send('warn');console.error=send('error');window.addEventListener('error',function(e){parent.postMessage({__kegodev_console:true,level:'error',args:[e.message+(e.filename?' ('+e.filename+':'+e.lineno+')':'')]},'*');});window.addEventListener('unhandledrejection',function(e){parent.postMessage({__kegodev_console:true,level:'error',args:['Unhandled promise rejection:',e.reason]},'*');});window.addEventListener('message',function(e){var d=e.data;if(!d||!d.__kegodev_css_update)return;var list=document.querySelectorAll('style[data-kegodev-source]'),style=null;for(var i=0;i<list.length;i++){if(list[i].getAttribute('data-kegodev-source')===d.path){style=list[i];break;}}if(!style){style=document.createElement('style');style.setAttribute('data-kegodev-source',d.path);document.head.appendChild(style);}style.textContent=d.css||'';});})();";
  const shimTag = doc.createElement('script');
  shimTag.textContent = consoleShim;
  doc.head.insertBefore(shimTag, doc.head.firstChild);

  // Add scripts referenced by HTML first, preserving their document order.
  localScripts.forEach(script => doc.body.appendChild(script));

  // Automatically include any remaining standalone JavaScript files.
  filesInEntryProject(entry, 'javascript').forEach(path => {
    if(includedJs.has(path)) return;
    const script = doc.createElement('script');
    if(extOf(path) === 'mjs') script.type = 'module';
    script.setAttribute('data-kegodev-source', path);
    script.textContent = files[path].content;
    doc.body.appendChild(script);
    includedJs.add(path);
  });

  const source = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  if(!force && source === lastCompiledSource) return;
  lastCompiledSource = source;
  preview.srcdoc = source;
  compileStatus.textContent = 'Built in '+Math.max(1,Math.round(performance.now()-compileStartedAt))+' ms';
  flashCompileButton();
}

renderFileList();
renderEditor();
if(savedSettings.consoleCollapsed) consolePanel.classList.add('collapsed');
if(savedSettings.previewOpen) openPreview();

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
