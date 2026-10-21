import {GM_SANDBOX} from './runtime.js';
import {SOUND_EVENTS, SOUND_ASSETS} from './sound-catalog.js';
import {soundSettings, SOUND_FILE_LIMIT, SOUND_MIME_TYPES} from './sound-settings.js';
import {soundPlayer} from './sound-player.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const percentage = value => `${Math.round(value * 100)}%`;
const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MiB` : `${Math.ceil((bytes || 0) / 1024)} KiB`;

/** This panel edits audio preferences only. It never calls learning or reward actions. */
export function createSoundWorkbench({beforePreview = () => {}, onPlayback = () => {}, previewVolume = entry => entry?.volume} = {}) {
  let target = null, query = '', module = 'all', playing = '', generation = 0;
  let status = '', isError = false, uploadEvent = '', uploading = false;
  const bound = new WeakSet();
  const visible = () => !!target?.querySelector('[data-sound-workbench]');
  const assets = () => [...SOUND_ASSETS, ...Object.values(soundSettings.get().customAssets)];
  const hint = () => GM_SANDBOX ? '模拟模式：修改只在本次测试生效，刷新后重置。' : '修改自动保存到当前浏览器，立即生效。导出可保留完整配置。';
  function setStatus(message, error = false) {
    status = message; isError = error;
    if (!visible()) return;
    const node = target.querySelector('[data-sound-status]');
    node.textContent = message || hint(); node.classList.toggle('is-error', error);
  }
  function playbackButtons() {
    if (!visible()) return;
    for (const card of target.querySelectorAll('[data-sound-event]')) {
      const button = card.querySelector('[data-sound-action="preview"]'), active = playing === card.dataset.soundEvent;
      button.textContent = active ? '停止试听' : '试听';
      button.setAttribute('aria-pressed', String(active)); button.classList.toggle('is-playing', active);
    }
  }
  function stop() {
    generation++; const wasPlaying = playing; playing = ''; soundPlayer.stop();
    if (wasPlaying) { setStatus('试听已停止。'); onPlayback('试听已停止。',false); playbackButtons(); }
  }
  function save(change, message, rerender = true) {
    stop();
    const result = soundSettings.save(change);
    setStatus(result.ok ? `${message} ${GM_SANDBOX ? '刷新后重置。' : '已保存到本机。'}` : result.error, !result.ok);
    if (rerender || !result.ok) renderControls();
    return result.ok;
  }
  function renderControls() {
    if (!visible()) return;
    const settings = soundSettings.get();
    target.querySelector('[data-sound-master-enabled]').checked = settings.enabled;
    target.querySelector('[data-sound-master-volume]').value = Math.round(settings.volume * 100);
    target.querySelector('[data-sound-master-value]').textContent = percentage(settings.volume);
    renderItems();
  }
  function renderItems() {
    if (!visible()) return;
    const settings = soundSettings.get(), library = assets(), lookup = new Map(library.map(asset => [asset.id, asset]));
    const list = SOUND_EVENTS.filter(event => {
      const asset = lookup.get(settings.events[event.id].assetId);
      return (module === 'all' || event.module === module) && `${event.title} ${event.module} ${event.trigger} ${event.id} ${asset?.title || ''} ${asset?.url?.startsWith('data:') ? '' : asset?.url || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    });
    const focus = document.activeElement?.dataset.soundFocus;
    target.querySelector('[data-sound-count]').textContent = `${list.length} / ${SOUND_EVENTS.length} 个使用点`;
    target.querySelector('[data-sound-list]').innerHTML = list.map(event => {
      const config = settings.events[event.id], asset = lookup.get(config.assetId), custom = !!settings.customAssets[config.assetId];
      return `<article class="gm-sound-card${config.assetId === null ? ' is-unbound' : ''}" data-sound-event="${esc(event.id)}"><header><div><span class="gm-badge">${esc(event.module)} · ${event.kind === 'bgm' ? '背景音乐' : '交互音效'}</span><h3>${esc(event.title)}</h3><p>${esc(event.trigger)}</p><code>${esc(event.id)}</code></div><label class="gm-sound-toggle"><input type="checkbox" data-sound-enabled data-sound-focus="${esc(event.id)}-enabled"${config.enabled ? ' checked' : ''}>启用</label></header><div class="gm-sound-current"><strong>${esc(asset?.title || '已删除配置 · 此处不播放')}</strong><p class="gm-file-path">${esc(custom ? `本机音频 · ${asset.mime} · ${size(asset.bytes)}` : asset?.url || '可从下方素材库重新选择，或恢复默认。')}</p>${asset ? `<p class="gm-sound-source">${esc(custom ? '仅保存在当前浏览器，可随配置导出。' : `来源：${typeof asset.source === 'string' ? asset.source : asset.source?.title || '声匣素材库'} · ${typeof asset.license === 'string' ? asset.license : asset.license?.name || '授权见项目素材清单'}`)}</p>` : ''}</div><label class="gm-sound-replace">替换素材<select data-sound-asset data-sound-focus="${esc(event.id)}-asset" aria-label="${esc(event.title)}替换素材"><option value=""${config.assetId === null ? ' selected' : ''}>不配置声音</option>${library.map(item => `<option value="${esc(item.id)}"${item.id === config.assetId ? ' selected' : ''}>${settings.customAssets[item.id] ? '本机 · ' : ''}${esc(item.title)}</option>`).join('')}</select></label><label class="gm-sound-volume-label">使用点音量<output data-sound-volume-value>${percentage(config.volume)}</output></label><input type="range" min="0" max="100" step="1" value="${Math.round(config.volume * 100)}" data-sound-volume data-sound-focus="${esc(event.id)}-volume" aria-label="${esc(event.title)}音量"><div class="gm-sound-actions"><button data-sound-action="preview" data-sound-focus="${esc(event.id)}-preview"${asset ? '' : ' disabled'} aria-pressed="false">试听</button><button data-sound-action="upload"${uploading ? ' disabled' : ''}>本机替换</button><button data-sound-action="delete"${asset ? '' : ' disabled'}>删除配置</button><button data-sound-action="reset" data-sound-focus="${esc(event.id)}-reset">恢复默认</button></div><p class="gm-sound-state">${!asset ? '未绑定素材' : !config.enabled ? '已禁用 · 配置仍保留' : '已启用'}${event.kind === 'bgm' ? ' · 同时受背景音乐总开关、总音量控制；试听最多 12 秒' : ' · 同时受音效总开关、总音量控制'}</p></article>`;
    }).join('') || '<p class="gm-empty">没有找到匹配的声音使用点。</p>';
    const customAssets = Object.values(settings.customAssets);
    target.querySelector('[data-sound-custom-library]').innerHTML = customAssets.length ? `<details class="gm-sound-library"><summary>本机素材（${customAssets.length} 项）</summary><p>删除素材前需先解除所有使用点的绑定。删除配置仅影响那个使用点。</p>${customAssets.map(asset => {
      const count = Object.values(settings.events).filter(value => value.assetId === asset.id).length;
      return `<div class="gm-sound-library-row"><span>${esc(asset.title)}<small>${size(asset.bytes)} · ${count} 处使用</small></span><button data-sound-action="remove-asset" data-sound-asset-id="${esc(asset.id)}"${count ? ' disabled' : ''}>删除素材</button></div>`;
    }).join('')}</details>` : '';
    playbackButtons();
    if (focus) target.querySelector(`[data-sound-focus="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
  }
  async function audition(id) {
    if (playing === id) { stop(); onPlayback('试听已停止。',false); return; }
    beforePreview(); stop();
    const volume = previewVolume(soundPlayer.resolve(id));
    if (!volume) {
      const message = '当前试听音量为 0，请提高使用点音量及对应的音效或背景音乐总音量。';
      setStatus(message,true); onPlayback(message,false); return;
    }
    const token = ++generation, event = SOUND_EVENTS.find(value => value.id === id);
    playing = id; setStatus(`正在试听：${event.title}`); playbackButtons(); onPlayback(`正在试听：${event.title}`,true);
    try {
      const complete = await soundPlayer.play(id,{preview:true,volume});
      if (token !== generation) return;
      playing = ''; const message = complete ? `试听结束：${event.title}` : `试听未完成：${event.title}。音频可能不可用或已被停止。`;
      setStatus(message,!complete); onPlayback(message,false); playbackButtons();
    } catch (error) {
      if (token !== generation) return;
      playing = ''; const message = `试听失败：${error?.message || '音频无法播放'}`;
      setStatus(message,true); onPlayback(message,false); playbackButtons();
    }
  }
  async function upload(file, id) {
    if (!file || !id) return;
    const mime = file.type.toLocaleLowerCase();
    if (!/\.(mp3|wav|ogg|m4a)$/i.test(file.name) || !SOUND_MIME_TYPES.includes(mime)) { setStatus('文件格式不支持，请选择 MP3、WAV、OGG 或 M4A 音频。',true); return; }
    if (!file.size || file.size > SOUND_FILE_LIMIT) { setStatus('本机音频需大于 0 字节且不超过 2 MiB。',true); return; }
    uploading = true; renderItems(); setStatus(`正在检查音频：${file.name}`);
    let context;
    try {
      const AudioContextType = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextType) throw new Error('当前浏览器无法验证音频解码，请使用支持 Web Audio 的浏览器');
      context = new AudioContextType();
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (!decoded.length || !Number.isFinite(decoded.duration) || decoded.duration <= 0) throw new Error('音频内容为空或无法解码');
      const url = await new Promise((resolve,reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(file);
      });
      const assetId = `custom-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      stop();
      save({customAssets:{[assetId]:{id:assetId,title:file.name,url,bytes:file.size,mime}},events:{[id]:{assetId}}},'本机替换音频已通过解码检查。');
    } catch (error) { setStatus(`替换未保存：${error?.message || '无法读取音频文件'}。`,true); }
    finally { try { await context?.close(); } catch { /* Context may already be closed. */ } uploading = false; renderItems(); }
  }
  function exportSettings() {
    const blob = new Blob([JSON.stringify({format:'xiaoya-sounds-v1',...soundSettings.export()},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '小芽英语-音效配置.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
    setStatus('已导出当前声音配置，包含已上传的本机素材。');
  }
  function bind(node) {
    if (bound.has(node)) return; bound.add(node);
    node.addEventListener('click', event => {
      const button = event.target.closest('[data-sound-action]'); if (!button || button.disabled) return;
      const action = button.dataset.soundAction, id = button.closest('[data-sound-event]')?.dataset.soundEvent;
      if (action === 'preview') void audition(id);
      else if (action === 'delete') { stop(); save({events:{[id]:{assetId:null}}},'已删除这个使用点的配置，素材库仍保留。'); }
      else if (action === 'reset') { stop(); const result = soundSettings.resetEvent(id); setStatus(result.ok ? `已恢复默认。${GM_SANDBOX ? '刷新后重置。' : '已保存到本机。'}` : result.error,!result.ok); renderControls(); }
      else if (action === 'reset-all') { stop(); const result = soundSettings.resetAll(); setStatus(result.ok ? `所有声音配置已恢复默认。${GM_SANDBOX ? '刷新后重置。' : '已保存到本机。'}` : result.error,!result.ok); renderControls(); }
      else if (action === 'upload') { uploadEvent = id; const input = target.querySelector('[data-sound-file]'); input.value = ''; input.click(); }
      else if (action === 'remove-asset') save({customAssets:{[button.dataset.soundAssetId]:null}},'未使用的本机素材已删除。');
      else if (action === 'export') exportSettings();
    });
    node.addEventListener('input', event => {
      if (event.target.matches('[data-sound-search]')) { query = event.target.value; renderItems(); }
      if (event.target.matches('[data-sound-master-volume]')) target.querySelector('[data-sound-master-value]').textContent = `${event.target.value}%`;
      if (event.target.matches('[data-sound-volume]')) event.target.closest('[data-sound-event]').querySelector('[data-sound-volume-value]').textContent = `${event.target.value}%`;
    });
    node.addEventListener('change', event => {
      const control = event.target, id = control.closest('[data-sound-event]')?.dataset.soundEvent;
      if (control.matches('[data-sound-module]')) { module = control.value; renderItems(); }
      else if (control.matches('[data-sound-master-enabled]')) { stop(); save({enabled:control.checked},'音效总开关已更新。'); }
      else if (control.matches('[data-sound-master-volume]')) save({volume:Number(control.value)/100},'音效总音量已更新。',false);
      else if (control.matches('[data-sound-enabled]')) { stop(); save({events:{[id]:{enabled:control.checked}}},'使用点开关已更新。'); }
      else if (control.matches('[data-sound-volume]')) save({events:{[id]:{volume:Number(control.value)/100}}},'使用点音量已更新。',false);
      else if (control.matches('[data-sound-asset]')) { stop(); save({events:{[id]:{assetId:control.value || null}}},'替换素材已更新。'); }
      else if (control.matches('[data-sound-file]')) { const id = uploadEvent; uploadEvent = ''; void upload(control.files?.[0],id); }
    });
  }
  function render(node) {
    target = node; bind(node);
    target.innerHTML = `<section data-sound-workbench><div class="gm-section-heading"><div><h2>每一处声音，都能找到</h2><p>按模块查看点击、奖励、流程反馈与 BGM；试听不会改动儿童学习记录。</p></div><span class="gm-count" data-sound-count></span></div><section class="gm-sound-master"><label class="gm-sound-toggle"><input type="checkbox" data-sound-master-enabled>音效总开关</label><div class="gm-sound-master-volume"><label>音效总音量<output data-sound-master-value></output></label><input type="range" min="0" max="100" step="1" data-sound-master-volume aria-label="音效总音量"></div><div class="gm-sound-actions"><button data-sound-action="export">导出配置</button><button data-sound-action="reset-all">全部恢复默认</button></div><p>背景音乐总开关与音量在「背景音乐」页调节。试听可检查禁用的素材；上传文件仅保存在本机，单个最多 2 MiB，总配置最多 5 MiB。</p></section><div class="gm-sound-filters"><label class="gm-search-label"><span class="gm-sr">搜索声音使用点</span><input type="search" data-sound-search placeholder="搜使用点、触发位置或素材" value="${esc(query)}" autocomplete="off"></label><select data-sound-module aria-label="音效模块筛选"><option value="all">全部模块</option>${[...new Set(SOUND_EVENTS.map(event => event.module))].map(value => `<option value="${esc(value)}"${module === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select></div><p class="gm-sound-status" data-sound-status role="status" aria-live="polite"></p><div class="gm-sound-list" data-sound-list></div><div data-sound-custom-library></div><input type="file" data-sound-file accept=".mp3,.wav,.ogg,.m4a,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/ogg,audio/mp4,audio/x-m4a" hidden></section>`;
    setStatus(status,isError); renderControls();
  }
  return Object.freeze({render,stop});
}
