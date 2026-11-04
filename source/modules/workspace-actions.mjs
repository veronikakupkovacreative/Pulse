/**
 * Shared, functional audio actions for each red result panel.
 * Preview and Export operate on the current committed AudioWorkspace buffer.
 * Modules with uncommitted renders keep their own A/B and export controls.
 */
export function mountWorkspaceActions(container, workspace, root = document) {
  if (!container || !workspace || typeof root.createElement !== 'function') return () => {};
  const section = root.createElement('section');
  section.className = 'pulse-workspace-actions';
  section.setAttribute('aria-label', 'Current audio preview and WAV export');
  section.innerHTML = `
    <div class="pulse-workspace-actions-heading"><span>OUTPUT / WORKSPACE AUDIO</span><span>24-BIT PCM WAV</span></div>
    <div class="pulse-workspace-actions-buttons">
      <button type="button" data-workspace-preview disabled aria-label="Preview currently loaded workspace audio">PREVIEW AUDIO <span aria-hidden="true">&#9654;</span></button>
      <button type="button" data-workspace-export disabled aria-label="Export the currently loaded workspace audio as 24-bit WAV">EXPORT WAV <span aria-hidden="true">&#8599;</span></button>
    </div>
    <p class="pulse-workspace-actions-status" role="status" aria-live="polite">Load audio to enable preview and WAV export.</p>`;
  container.append(section);
  const preview = section.querySelector('[data-workspace-preview]');
  const exportButton = section.querySelector('[data-workspace-export]');
  const message = section.querySelector('.pulse-workspace-actions-status');
  const audioMeta = root.querySelector('#audio-meta');
  const sourceStatus = root.querySelector('#source-status');
  let disposed = false;
  let busy = false;
  const setStatus = (text, error = false) => {
    if (disposed) return;
    message.textContent = text;
    message.dataset.error = String(error);
  };
  const refresh = () => {
    if (disposed) return;
    const hasAudio = Boolean(workspace.buffer && workspace.buffer.length > 0);
    preview.disabled = exportButton.disabled = busy || !hasAudio;
    const playing = hasAudio && workspace.playing;
    preview.innerHTML = playing ? 'PAUSE AUDIO <span aria-hidden="true">&#10074;&#10074;</span>' : 'PREVIEW AUDIO <span aria-hidden="true">&#9654;</span>';
    preview.setAttribute('aria-label', playing ? 'Pause workspace audio' : 'Preview currently loaded workspace audio');
    preview.setAttribute('aria-pressed', String(Boolean(playing)));
  };
  preview.addEventListener('click', async () => {
    if (busy || !workspace.buffer) return;
    busy = true; refresh();
    try {
      await workspace.togglePlay();
      if (!disposed) setStatus(workspace.playing ? 'Playing the current workspace audio.' : 'Preview paused.');
    } catch (error) {
      setStatus(error?.message || 'Audio preview failed.', true);
    } finally {
      busy = false; refresh();
    }
  });
  exportButton.addEventListener('click', () => {
    if (busy || !workspace.buffer) return;
    busy = true; refresh();
    try {
      workspace.save(24, false);
      setStatus('Current workspace audio exported as 24-bit PCM WAV.');
    } catch (error) {
      setStatus(error?.message || 'WAV export failed.', true);
    } finally {
      busy = false; refresh();
    }
  });
  const onAudioSource = () => refresh();
  root.addEventListener('pulse:audio-source', onAudioSource);
  const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(refresh) : null;
  for (const target of [audioMeta, sourceStatus]) {
    if (target) observer?.observe(target, {subtree:true, childList:true, characterData:true});
  }
  refresh();
  return () => {
    disposed = true;
    observer?.disconnect();
    root.removeEventListener('pulse:audio-source', onAudioSource);
    section.remove();
  };
}
