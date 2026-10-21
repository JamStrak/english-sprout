import {INTERNAL_BUILD, GM_SANDBOX} from './runtime.js';
import {gmBridge} from './experience.js';
import {EVENTS} from './content.js';
import {STORIES} from './stories.js';
import {CORE_PHRASE_EVENT_IDS} from './curriculum.js';
import {PHRASE_PACK_V015_EVENT_IDS} from './phrase-pack-v015.js';
import {CHALLENGE_UNITS} from './challenges.js';
import {VOICES, lessonAudio} from './voices.js';
import {playSound, stopSound} from './audio.js';
import {GARDEN_MUSIC_FILE, GARDEN_MUSIC_VOLUME} from './garden-music.js';

// This module is included only in internal builds. The guard also keeps a
// mistakenly imported source module from exposing tools on a public build.
if (INTERNAL_BUILD) installWorkbench();

function installWorkbench() {
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./gm.css', import.meta.url).href; document.head.append(stylesheet);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const bytes = value => Number(value) >= 1048576 ? `${(value / 1048576).toFixed(2)} MB` : `${Math.max(0, Math.round((value || 0) / 1024))} KB`;
  const absolute = value => new URL(value, document.baseURI).href;
  const basename = value => String(value || '').split('/').pop();
  const coreIds = new Set(CORE_PHRASE_EVENT_IDS), newIds = new Set(PHRASE_PACK_V015_EVENT_IDS);
  const events = new Map(EVENTS.map(event => [event.id, event]));
  const byLesson = new Map(EVENTS.map(event => [event.lessonId, event]));
  const imageLabels = new Map();
  for (const story of STORIES) {
    const add = (filename, use) => {
      if (!filename) return;
      const values = imageLabels.get(filename) || [];
      values.push(`${story.event.english} · ${story.event.title} · ${use}`);
      imageLabels.set(filename, values);
    };
    add(story.image, '主画面'); add(story.introImage, '开场画面');
    add(story.alternateImages?.request, '生活验收'); add(story.alternateImages?.resolved, '验收完成');
  }
  const queries = {courses:'',voices:'',images:''};
  const filters = {courses:'all',voices:'all',images:'all'};
  const pages = {courses:0,voices:0,images:0};
  let activeTab = 'courses', catalog = null, catalogPromise = null, catalogError = '', selectedVoice = gmBridge.inspect().voice || 'pip';
  let result = gmBridge.inspect().simulationResult || 'three', playbackGeneration = 0, playingUrl = '', playbackMessage = '点音色按钮试听；每次只播放一段。';
  let previousFocus = null, previewFocus = null;
  let musicStatusTimer = null;
  const version = document.querySelector('meta[name="xiaoya-version"]')?.content || '开发版';
  const build = document.querySelector('meta[name="xiaoya-build"]')?.content || '';
  const host = document.createElement('div'); host.id = 'xiaoya-gm';
  host.innerHTML = `${GM_SANDBOX ? `<aside class="gm-testbar" aria-label="GM 流程测试工具"><span class="gm-test-mark">GM · 模拟</span><button data-gm-action="open">测试台</button><label class="gm-score-label">下一次结果 <select data-gm-result aria-label="模拟下一次录音结果">${resultOptions()}</select></label><button data-gm-action="advance" title="跳过当前示范，直接测试说话步骤">跳过示范</button><button data-gm-action="exit">退出测试</button><span class="gm-test-hint">点击话筒即可模拟 · 不录音 · 刷新重置</span></aside>` : '<button class="gm-launcher" data-gm-action="open" aria-haspopup="dialog" aria-controls="gm-workbench">GM <span>内测</span></button>'}
    <dialog id="gm-workbench" class="gm-dialog" aria-labelledby="gm-title"><div class="gm-dialog-shell"><header class="gm-header"><div><p class="gm-eyebrow">XIAOYA / INTERNAL</p><h1 id="gm-title">小芽测试台 <span>GM</span></h1><p class="gm-version">v${esc(version)} · ${esc(build)} · ${GM_SANDBOX?'模拟测试中':'开发内测版'}</p></div><button data-gm-action="close" class="gm-close" aria-label="关闭 GM 测试台">×</button></header><p class="gm-safety">${GM_SANDBOX?'这里的进度、贝壳、水滴只用于本次测试，刷新即重置。':'试听和看图不会修改学习记录。进入流程测试后，使用独立临时记录。'} 模拟星级不代表识别准确率。</p><nav class="gm-tabs" role="tablist" aria-label="测试台分类">${[['courses','课程速查'],['voices','声音库'],['images','图片库'],['music','背景音乐'],['flows','流程测试']].map(([id,title])=>`<button id="gm-tab-${id}" role="tab" aria-controls="gm-content" data-gm-tab="${id}" aria-selected="${id===activeTab}">${title}</button>`).join('')}</nav><div id="gm-filters" class="gm-filters"></div><main id="gm-content" class="gm-content" role="tabpanel" aria-labelledby="gm-tab-courses"></main><footer class="gm-player"><span class="gm-player-dot" aria-hidden="true"></span><p data-gm-playback role="status" aria-live="polite"></p><button data-gm-action="stop">停止声音</button></footer></div></dialog>
    <dialog id="gm-picture-preview" class="gm-preview" aria-labelledby="gm-picture-title"><header><div><h2 id="gm-picture-title">图片预览</h2><p data-gm-picture-info></p></div><button data-gm-action="close-preview" class="gm-close" aria-label="关闭图片预览">×</button></header><div class="gm-preview-canvas"><img alt="" data-gm-large-picture></div><p data-gm-picture-path class="gm-file-path"></p></dialog>`;
  document.body.append(host);
  if (GM_SANDBOX) document.body.classList.add('gm-sandbox');
  const dialog = host.querySelector('#gm-workbench'), content = host.querySelector('#gm-content'), filterBar = host.querySelector('#gm-filters');
  const preview = host.querySelector('#gm-picture-preview'), largePicture = preview.querySelector('[data-gm-large-picture]');
  content.tabIndex = -1;
  host.querySelectorAll('[data-gm-result]').forEach(select => { select.value = result; });
  updatePlayback();

  function resultOptions() {
    return [['three','3 星 · 通过'],['two','2 星 · 再试'],['one','1 星 · 再试'],['silence','静音'],['unavailable','识别不可用']].map(([id,title])=>`<option value="${id}">${title}</option>`).join('');
  }
  function stopPlayback(message = '已停止播放。') {
    clearInterval(musicStatusTimer); musicStatusTimer = null; gmBridge.previewMusic(false);
    playbackGeneration++; playingUrl = ''; stopSound(); playbackMessage = message; updatePlayback(); updateMusicControls();
  }
  function updatePlayback() {
    host.querySelector('[data-gm-playback]').textContent = playbackMessage;
    host.querySelector('.gm-player').classList.toggle('is-playing', !!playingUrl);
    host.querySelectorAll('[data-gm-audio]').forEach(button => {
      const active = button.dataset.gmAudio === playingUrl;
      button.classList.toggle('is-playing', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  async function audition(url, title) {
    if (url === GARDEN_MUSIC_FILE) { previewMusic(); return; }
    stopPlayback();
    const generation = ++playbackGeneration;
    gmBridge.pause(); stopSound(); playingUrl = url; playbackMessage = `正在读取：${title}`; updatePlayback();
    try {
      const complete = await playSound(url, state => {
        if (generation !== playbackGeneration) return;
        if (state === 'playing') playbackMessage = `正在播放：${title}`;
        updatePlayback();
      });
      if (generation !== playbackGeneration) return;
      playingUrl = ''; playbackMessage = complete ? `已播完：${title}` : `已停止：${title}`; updatePlayback();
    } catch (error) {
      if (generation !== playbackGeneration) return;
      playingUrl = ''; playbackMessage = `播放失败：${title}。${error.message || '请检查本地资源。'}`; updatePlayback();
    }
  }
  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement; gmBridge.pause(); dialog.showModal();
    render(); dialog.querySelector('[data-gm-action="close"]').focus();
  }
  function close() {
    stopPlayback(); if (preview.open) preview.close(); dialog.close(); gmBridge.resume();
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  function resetUrl() {
    const url = new URL(location.href);
    for (const key of [...url.searchParams.keys()]) if (key === 'gm' || /^gm[A-Z]/.test(key)) url.searchParams.delete(key);
    return url;
  }
  function launch(parameters) {
    stopPlayback();
    const url = resetUrl(); url.searchParams.set('gm', 'test'); url.searchParams.set('gmVoice', selectedVoice); url.searchParams.set('gmResult', result);
    for (const [key,value] of Object.entries(parameters)) url.searchParams.set(key, value);
    location.assign(url.href);
  }
  async function run(action, parameters) {
    if (!GM_SANDBOX) { launch(parameters); return; }
    close();
    try { await action(); }
    catch (error) { open(); playbackMessage = `测试操作未完成：${error.message || error}`; updatePlayback(); }
  }
  function matches(text, query) { return text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()); }
  function audioButton(url, label, title = label) { return `<button type="button" data-gm-audio="${esc(url)}" data-gm-audio-title="${esc(title)}" aria-pressed="false">${esc(label)}</button>`; }
  function voicePicker() { return `<label>测试音色 <select data-gm-voice aria-label="流程测试音色">${VOICES.map(voice=>`<option value="${voice.id}"${voice.id===selectedVoice?' selected':''}>${esc(voice.name)}</option>`).join('')}</select></label>`; }
  function render() {
    host.querySelectorAll('[data-gm-tab]').forEach(button => { const active = button.dataset.gmTab === activeTab; button.setAttribute('aria-selected',String(active)); button.tabIndex = active ? 0 : -1; });
    content.setAttribute('aria-labelledby',`gm-tab-${activeTab}`);
    if (activeTab === 'music') filterBar.innerHTML = '';
    else if (activeTab === 'flows') filterBar.innerHTML = voicePicker();
    else {
      const placeholder = activeTab === 'courses' ? '搜英文、中文、课程 ID' : activeTab === 'voices' ? '搜句子、提示音或文件名' : '搜画面、句子或文件名';
      const options = activeTab === 'courses' ? [['all','全部课程'],['new','新增 60 句'],['core','核心课程'],['extra','历史扩展场景']] : activeTab === 'voices' ? [['all','全部声音'],...VOICES.map(voice=>[voice.id,voice.name]),['guide','中文引导 / 其他']] : [['all','全部图片'],...Array.from(new Set((catalog?.images || []).map(item=>item.category || '其他'))).map(category=>[category,category])];
      filterBar.innerHTML = `<label class="gm-search-label"><span class="gm-sr">${placeholder}</span><input type="search" data-gm-search placeholder="${placeholder}" value="${esc(queries[activeTab])}" autocomplete="off"></label><label class="gm-sr" for="gm-category">筛选分类</label><select id="gm-category" data-gm-filter aria-label="筛选分类">${options.map(([id,title])=>`<option value="${esc(id)}"${filters[activeTab]===id?' selected':''}>${esc(title)}</option>`).join('')}</select>${activeTab==='courses'?voicePicker():''}`;
    }
    renderContent();
  }
  function pagination(total, size) {
    const pageCount = Math.max(1, Math.ceil(total / size)); pages[activeTab] = Math.min(pages[activeTab],pageCount-1);
    return `<nav class="gm-pagination" aria-label="列表翻页"><button data-gm-action="previous"${pages[activeTab]===0?' disabled':''}>上一页</button><span>${pages[activeTab]+1} / ${pageCount} 页 · ${total} 项</span><button data-gm-action="next"${pages[activeTab]>=pageCount-1?' disabled':''}>下一页</button></nav>`;
  }
  function pageItems(items, size) { pages[activeTab]=Math.min(pages[activeTab],Math.max(0,Math.ceil(items.length/size)-1)); return items.slice(pages[activeTab]*size,(pages[activeTab]+1)*size); }
  function renderContent() {
    if (activeTab === 'courses') renderCourses();
    else if (activeTab === 'flows') renderFlows();
    else if (activeTab === 'music') renderMusic();
    else if (!catalog) {
      content.innerHTML = `<div class="gm-empty"><h2>${catalogError?'资源索引还未载入':'正在载入资源索引…'}</h2><p>${esc(catalogError || '只读取清单；音频按点击播放，图片分批显示。')}</p>${catalogError?'<button data-gm-action="retry-catalog">重新读取</button>':''}</div>`;
      if (!catalogError) void loadCatalog();
    } else if (activeTab === 'voices') renderVoices();
    else renderImages();
    content.scrollTop = 0; updatePlayback();
  }
  async function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogError = '';
    catalogPromise = (async () => {
      try {
        const response = await fetch(new URL('./gm-catalog.json',import.meta.url));
        if (!response.ok) throw new Error(`资源清单读取失败（${response.status}）`);
        const value = await response.json();
        if (!Array.isArray(value.images) || !Array.isArray(value.audio)) throw new Error('资源清单格式不正确');
        catalog = value;
      } catch (error) { catalogError = error.message; }
      finally { catalogPromise = null; if (dialog.open && ['voices','images'].includes(activeTab)) render(); }
    })();
    return catalogPromise;
  }
  function renderCourses() {
    const items = STORIES.filter(story => {
      const event = story.event, filter = filters.courses;
      return (filter==='all'||filter==='new'&&newIds.has(event.id)||filter==='core'&&coreIds.has(event.id)||filter==='extra'&&!coreIds.has(event.id)) && matches(`${event.english} ${event.chinese} ${event.title} ${event.id} ${event.lessonId}`,queries.courses);
    });
    content.innerHTML = `<div class="gm-section-heading"><div><h2>一句话，一键进入</h2><p>${EVENTS.length} 个课程场景 · ${CORE_PHRASE_EVENT_IDS.length} 句核心表达 · 新学、复习、验收独立直达</p></div><span class="gm-count">${items.length} 项</span></div><div class="gm-course-grid">${pageItems(items,12).map(story=>{
      const event=story.event, image=story.image?`xiaoya/stories/${story.image}`:'';
      return `<article class="gm-course" data-gm-course="${event.id}">${image?`<button class="gm-course-picture" data-gm-image="${esc(image)}" data-gm-image-title="${esc(`${event.english} · ${event.title}`)}" aria-label="放大查看：${esc(event.title)}"><img src="${esc(absolute(image))}" alt="${esc(event.title)}" loading="lazy" decoding="async"><span>${story.imageLayout==='single'?'主画面':'多格原图'}</span></button>`:'<div class="gm-course-picture gm-no-picture">程序绘图</div>'}<div class="gm-course-body"><span class="gm-badge">${newIds.has(event.id)?'新增 60 句':coreIds.has(event.id)?'核心表达':'历史扩展场景'}</span><h3>${esc(event.english)}</h3><p>${esc(event.chinese)} · ${esc(event.title)}</p><code>${esc(event.id)}</code><div class="gm-voice-buttons" aria-label="${esc(event.title)}音色试听">${VOICES.map(voice=>audioButton(lessonAudio(event,voice.id),voice.name,`${event.english} · ${voice.name}`)).join('')}${audioButton(event.hintAudio||`xiaoya/audio/v3/${event.id}.mp3`,'中文帮助',`${event.title} · 中文帮助`)}</div><div class="gm-course-actions"><button class="gm-primary" data-gm-action="lesson" data-gm-event="${event.id}" data-gm-mode="new">新学流程</button><button data-gm-action="lesson" data-gm-event="${event.id}" data-gm-mode="review">复习</button><button data-gm-action="lesson" data-gm-event="${event.id}" data-gm-mode="checkup">验收</button></div></div></article>`;
    }).join('')||'<p class="gm-empty">没有找到这句话，请试试其他关键词。</p>'}</div>${pagination(items.length,12)}`;
  }
  function describeAudio(item) {
    const url = item.url, file = basename(url), stem = file.replace(/\.[^.]+$/,'');
    const voiceId = ['aiden','ryan','pip'].includes(item.category) ? item.category : ['hint','guide'].includes(item.category) ? 'guide' : /\/ryan\//.test(url)||file==='ryan.mp3'?'ryan':/\/characters\/pip\//.test(url)||file==='pip.mp3'?'pip':/\/xiaoya\/audio\/(?:v3\/)?/.test(url)&&!['aiden.mp3','ryan.mp3','pip.mp3'].includes(file)?'guide':'aiden';
    const phraseId = /\/phrases-v015\//.test(url) ? url.split('/').at(-2) : stem;
    const event = byLesson.get(phraseId) || events.get(stem.replace(/-elsewhere$/,''));
    const voice = VOICES.find(value=>value.id===voiceId);
    return {...item,voiceId,title:event?`${event.english} · ${event.chinese}${stem.endsWith('-elsewhere')?' · 换情境帮助':''}`:item.name||stem,label:voice?.name||'中文引导 / 其他'};
  }
  function renderVoices() {
    const items = catalog.audio.map(describeAudio).filter(item=>(filters.voices==='all'||item.voiceId===filters.voices)&&matches(`${item.title} ${item.url} ${item.label}`,queries.voices));
    content.innerHTML = `<div class="gm-section-heading"><div><h2>把每一段声音听清楚</h2><p>完整声音库 ${catalog.audio.length} 段 · 含三种示范音色、中文帮助和交互引导</p></div><span class="gm-count">${items.length} 段</span></div><div class="gm-audio-list">${pageItems(items,36).map(item=>`<article class="gm-audio-row"><div><span class="gm-badge">${esc(item.label)}</span><h3>${esc(item.title)}</h3><p class="gm-file-path">${esc(item.url)}</p></div><span class="gm-audio-size">${bytes(item.bytes)}</span>${audioButton(item.url,'播放',`${item.title} · ${item.label}`)}</article>`).join('')||'<p class="gm-empty">没有找到匹配的声音。</p>'}</div>${pagination(items.length,36)}`;
  }
  function renderImages() {
    const items = catalog.images.map(item=>({...item,title:(imageLabels.get(basename(item.url))||[]).join(' / ')||item.name||basename(item.url)})).filter(item=>(filters.images==='all'||(item.category||'其他')===filters.images)&&matches(`${item.title} ${item.url} ${item.category}`,queries.images));
    content.innerHTML = `<div class="gm-section-heading"><div><h2>画面与素材检查</h2><p>全库 ${catalog.images.length} 张 · 每页 24 张，按需加载 · 点图查看原图与尺寸</p></div><span class="gm-count">${items.length} 张</span></div><div class="gm-image-grid">${pageItems(items,24).map(item=>`<article class="gm-image-card"><button data-gm-image="${esc(item.url)}" data-gm-image-title="${esc(item.title)}" data-gm-image-bytes="${item.bytes||0}" aria-label="放大查看：${esc(item.title)}"><img src="${esc(absolute(item.url))}" alt="${esc(item.title)}" loading="lazy" decoding="async"></button><div><span class="gm-badge">${esc(item.category||'其他')} · ${bytes(item.bytes)}</span><h3>${esc(item.title)}</h3><p class="gm-file-path">${esc(basename(item.url))}</p></div></article>`).join('')||'<p class="gm-empty">没有找到匹配的图片。</p>'}</div>${pagination(items.length,24)}`;
  }
  function renderMusic() {
    content.innerHTML = `<div class="gm-section-heading"><div><h2>花园背景音乐</h2><p>试听和实际花园使用同一音量，默认 50%。</p></div></div><section class="gm-flow-card gm-music-card"><span class="gm-badge">内置钢琴 · 循环播放</span><h3>花园钢琴</h3><p>${GM_SANDBOX?'当前是临时测试，调节只在本次测试生效，刷新即重置。':'调节立即生效，并保存在这个浏览器；关闭测试台后，花园沿用此设置。'}</p><label class="gm-music-toggle"><input type="checkbox" data-gm-music-enabled>开启花园背景音乐</label><label for="gm-music-volume">背景音乐音量 <output for="gm-music-volume" data-gm-music-volume-label>50%</output></label><input id="gm-music-volume" type="range" min="0" max="100" step="1" data-gm-music-volume aria-label="背景音乐音量" aria-describedby="gm-music-help"><p id="gm-music-help">0% 为静音。提示语播放时音乐会自动压低，说完恢复；学习和录音页面保持安静。</p><div class="gm-flow-buttons"><button class="gm-primary" data-gm-action="music-preview" aria-pressed="false">试听音乐</button><button data-gm-action="music-reset">恢复默认 50%</button></div><p data-gm-music-saved role="status"></p></section>`;
    updateMusicControls();
  }
  function updateMusicControls() {
    const settings = gmBridge.musicSettings(), volume = Math.round(settings.volume * 100);
    const toggle = content.querySelector('[data-gm-music-enabled]'), slider = content.querySelector('[data-gm-music-volume]');
    if (toggle) toggle.checked = settings.enabled;
    if (slider) { slider.value = volume; slider.setAttribute('aria-valuetext',`${volume}%`); }
    const label = content.querySelector('[data-gm-music-volume-label]'); if (label) label.textContent = `${volume}%`;
    const previewButton = content.querySelector('[data-gm-action="music-preview"]');
    if (previewButton) { previewButton.disabled = !settings.enabled || volume === 0; previewButton.textContent = settings.preview ? '停止试听' : '试听音乐'; previewButton.setAttribute('aria-pressed',String(settings.preview)); }
  }
  function setMusicSettings(change) {
    const saved = gmBridge.setMusicSettings(change), settings = gmBridge.musicSettings();
    if (playingUrl === GARDEN_MUSIC_FILE && !settings.preview) stopPlayback(settings.enabled?'音量为 0%，音乐已静音。':'花园音乐已关闭。');
    updateMusicControls();
    const status = content.querySelector('[data-gm-music-saved]');
    if (status) status.textContent = saved ? GM_SANDBOX?'已应用到本次临时测试。':'设置已保存，返回花园即可听到。' : '设置未保存，请检查浏览器存储权限后重试。';
    if (saved && settings.preview) updateMusicPlayback();
  }
  function updateMusicPlayback() {
    const settings = gmBridge.musicSettings();
    playbackMessage = settings.blocked ? '音乐暂未播放，请停止后重新试听。' : settings.playing ? `正在试听：花园钢琴 · ${Math.round(settings.volume*100)}% · 循环` : '正在准备花园钢琴…';
    updatePlayback();
  }
  function previewMusic() {
    const settings = gmBridge.musicSettings();
    stopPlayback();
    if (!settings.enabled || !settings.volume) {
      activeTab = 'music'; render(); playbackMessage = '请先开启背景音乐，并将音量调到 0% 以上。'; updatePlayback(); return;
    }
    playingUrl = GARDEN_MUSIC_FILE; gmBridge.previewMusic(true);
    updateMusicControls(); updateMusicPlayback(); musicStatusTimer = setInterval(updateMusicPlayback, 400);
  }
  function renderFlows() {
    content.innerHTML = `<div class="gm-section-heading"><div><h2>只点按钮，走完真实流程</h2><p>使用独立临时进度，话筒按钮会返回你指定的模拟结果。</p></div><span class="gm-count">免录音</span></div><div class="gm-flow-grid"><section class="gm-flow-card"><span class="gm-eyebrow">01 / PRACTICE</span><h3>学习与奖励</h3><p>从课程速查选一句 → 跳过示范或正常听完 → 点击原话筒 → 查看星级 → 领奖。可随时切换下一次结果。</p><label class="gm-flow-result">模拟下一次结果<select data-gm-result aria-label="流程面板模拟结果">${resultOptions()}</select></label><div class="gm-flow-buttons"><button class="gm-primary" data-gm-action="tab-courses">选一句测试</button><button data-gm-action="navigate" data-gm-page="home">从首页开始</button></div></section><section class="gm-flow-card"><span class="gm-eyebrow">02 / CHALLENGE</span><h3>挑战与阶段奖励</h3><p>补齐这一组的测试参与条件，再进入实际挑战。三颗星通过；两颗星、静音、识别不可用可检查重试反馈。</p><label>选择挑战组<select data-gm-challenge>${CHALLENGE_UNITS.map(unit=>`<option value="${unit.id}">${esc(unit.title)} · ${esc(events.get(unit.eventIds[0])?.english)}</option>`).join('')}</select></label><button class="gm-primary" data-gm-action="challenge">进入这一组挑战</button></section><section class="gm-flow-card"><span class="gm-eyebrow">03 / GARDEN</span><h3>商店与花园</h3><p>补充测试贝壳和水，检查买种子、种植、逐次浇水与开花。补给只存在于本次测试。</p><div class="gm-flow-buttons"><button class="gm-primary" data-gm-action="supply">补充测试资源</button><button data-gm-action="navigate" data-gm-page="garden">花园</button><button data-gm-action="navigate" data-gm-page="shop">商店</button></div></section><section class="gm-flow-card"><span class="gm-eyebrow">04 / INSPECT</span><h3>页面与测试状态</h3><p>家长页可检查临时学习记录和奖励记录。需要从头再来，重置本次测试即可。</p><div class="gm-flow-buttons"><button data-gm-action="navigate" data-gm-page="parent">家长页面</button><button data-gm-action="navigate" data-gm-page="challenges">挑战总览</button><button data-gm-action="reset">重置临时测试</button></div><p class="gm-current-state">${esc(describeState())}</p></section><section class="gm-flow-card"><span class="gm-eyebrow">05 / WELCOME</span><h3>欢迎小礼物</h3><p>从拆礼物到领取、听用途，再去学习或花园。每次预览重新建立临时花园，不影响真实存档。</p><div class="gm-flow-buttons"><button data-gm-action="welcome" data-gm-kind="shells">预览贝壳礼物</button><button data-gm-action="welcome" data-gm-kind="water">预览水滴礼物</button></div></section></div>`;
    content.querySelector('[data-gm-result]').value = result;
  }
  function describeState() {
    const state = gmBridge.inspect();
    return `当前：${state.page || 'home'}${state.eventId?` / ${state.eventId}`:''}${state.phase?` / ${state.phase}`:''} · 自由花园`;
  }
  function showImage(button) {
    previewFocus = button; const url = button.dataset.gmImage;
    preview.querySelector('#gm-picture-title').textContent = button.dataset.gmImageTitle || basename(url);
    preview.querySelector('[data-gm-picture-info]').textContent = `正在读取原图${button.dataset.gmImageBytes?` · ${bytes(button.dataset.gmImageBytes)}`:''}`;
    preview.querySelector('[data-gm-picture-path]').textContent = url;
    largePicture.alt = button.dataset.gmImageTitle || basename(url);
    largePicture.onload = () => { preview.querySelector('[data-gm-picture-info]').textContent = `${largePicture.naturalWidth} × ${largePicture.naturalHeight} px${button.dataset.gmImageBytes?` · ${bytes(button.dataset.gmImageBytes)}`:''}`; };
    largePicture.onerror = () => { preview.querySelector('[data-gm-picture-info]').textContent = '图片读取失败，请核对资源路径。'; };
    largePicture.src = absolute(url); preview.showModal(); preview.querySelector('button').focus();
  }
  function closePreview() { preview.close(); if (previewFocus?.isConnected) previewFocus.focus(); }
  host.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.dataset.gmTab) { if (activeTab!==button.dataset.gmTab) stopPlayback(); activeTab=button.dataset.gmTab; render(); return; }
    if (button.dataset.gmAudio) { void audition(button.dataset.gmAudio,button.dataset.gmAudioTitle); return; }
    if (button.dataset.gmImage) { showImage(button); return; }
    const action = button.dataset.gmAction;
    if (action==='open') open();
    else if (action==='close') close();
    else if (action==='close-preview') closePreview();
    else if (action==='stop') stopPlayback();
    else if (action==='music-preview') { if (gmBridge.musicSettings().preview) stopPlayback(); else previewMusic(); }
    else if (action==='music-reset') setMusicSettings({enabled:true,volume:GARDEN_MUSIC_VOLUME});
    else if (action==='previous'||action==='next') { pages[activeTab]+=action==='next'?1:-1; renderContent(); content.focus({preventScroll:true}); }
    else if (action==='retry-catalog') { catalogError=''; renderContent(); }
    else if (action==='tab-courses') { activeTab='courses'; render(); }
    else if (action==='lesson') { const id=button.dataset.gmEvent,mode=button.dataset.gmMode; void run(()=>{gmBridge.setVoice(selectedVoice);return gmBridge.openLesson(id,mode);},{gmEvent:id,gmMode:mode}); }
    else if (action==='navigate') { const page=button.dataset.gmPage; void run(()=>gmBridge.navigate(page),{gmPage:page}); }
    else if (action==='welcome') { const kind=button.dataset.gmKind; void run(()=>gmBridge.previewWelcome(kind),{gmWelcome:kind}); }
    else if (action==='supply') void run(()=>gmBridge.supplyGarden(),{gmPage:'shop',gmSupply:'1'});
    else if (action==='challenge') { const id=content.querySelector('[data-gm-challenge]').value; void run(()=>gmBridge.prepareChallenge(id),{gmPage:'challenges',gmChallenge:id}); }
    else if (action==='advance'&&GM_SANDBOX) gmBridge.advance();
    else if (action==='reset') { if (GM_SANDBOX) location.reload(); else launch({gmPage:'home'}); }
    else if (action==='exit') { stopPlayback(); location.assign(resetUrl().href); }
  });
  host.addEventListener('input', event => {
    if (event.target.matches('[data-gm-music-volume]')) setMusicSettings({volume:Number(event.target.value)/100});
    if (event.target.matches('[data-gm-search]')) { queries[activeTab]=event.target.value; pages[activeTab]=0; renderContent(); }
  });
  host.addEventListener('change', event => {
    if (event.target.matches('[data-gm-music-enabled]')) setMusicSettings({enabled:event.target.checked});
    if (event.target.matches('[data-gm-filter]')) { filters[activeTab]=event.target.value; pages[activeTab]=0; renderContent(); }
    if (event.target.matches('[data-gm-voice]')) { selectedVoice=event.target.value; if (GM_SANDBOX) gmBridge.setVoice(selectedVoice); }
    if (event.target.matches('[data-gm-result]')) { result=event.target.value; if (GM_SANDBOX) gmBridge.setResult(result); host.querySelectorAll('[data-gm-result]').forEach(select=>select.value=result); }
  });
  host.querySelector('.gm-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs = [...host.querySelectorAll('[data-gm-tab]')], current=tabs.findIndex(tab=>tab.dataset.gmTab===activeTab);
    const index = event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    event.preventDefault(); stopPlayback(); activeTab=tabs[index].dataset.gmTab; render(); tabs[index].focus();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  preview.addEventListener('cancel', event => { event.preventDefault(); closePreview(); });
  window.addEventListener('pagehide',()=>stopPlayback());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
}
