/** Integrate PULSE Audio Protection v1 with the canonical 01 / SOURCE AUDIO. */
import {workspace as w} from './workspace.mjs';
import {mountAudioProtection} from './protection-ui.mjs';

export const audioProtectionModule = Object.freeze({
  id: 'audio-protection',
  category: 'prepare',
  label: 'Audio Protection',
  mount({host}) {
    const view = mountAudioProtection({
      root: host,
      getSourceAudio: () => w.buffer ? {
        buffer: w.buffer,
        file: w.originalFile || null
      } : null
    });
    let lastBuffer = w.buffer;
    const unsubscribe = w.subscribe(() => {
      if (w.buffer === lastBuffer) return;
      lastBuffer = w.buffer;
      view.refresh();
    });
    return () => { unsubscribe(); view.destroy(); };
  }
});
