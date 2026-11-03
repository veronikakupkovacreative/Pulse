/** Shared registry filtering for the category dropdown navigation. */
export const HIDDEN_PUBLIC_TOOL_IDS=Object.freeze(new Set([
  'ai-voice-changer',
  'ai-text-to-sound-effects',
  'ai-voice-cloning',
  'ai-voice-isolator'
]));
export function getCategoryMenuItems(modules,category){
  if(!Array.isArray(modules)||typeof category!=='string')return [];
  const seen=new Set();
  return modules.filter((module)=>{
    if(!module||module.category!==category||typeof module.id!=='string'||
      typeof module.label!=='string'||typeof module.mount!=='function'||
      HIDDEN_PUBLIC_TOOL_IDS.has(module.id)||seen.has(module.id))return false;
    seen.add(module.id);
    return true;
  });
}
