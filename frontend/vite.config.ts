import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFile, writeFile } from 'node:fs/promises'

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  const siteUrl=(env.VITE_SITE_URL||'http://localhost:5173').replace(/\/$/,'');
  const demoPreview=env.VITE_DEMO_PREVIEW==='true';
  if(demoPreview && !/^https:\/\/[a-z0-9-]+\.magno-clean-staging\.pages\.dev$/.test(siteUrl)) throw new Error('La demo requiere un hostname Preview explícito de staging.');
  return {plugins:[react(),tailwindcss(),{name:'magno-clean-html-metadata',transformIndexHtml(html){const result=html.replaceAll('__MAGNO_SITE_URL__',siteUrl);return demoPreview?result.replace('name="robots" content="index,follow"','name="robots" content="noindex,nofollow"'):result},async closeBundle(){
    if(!demoPreview)return;
    const headers=await readFile('dist/_headers','utf8');
    await writeFile('dist/_headers',headers+'\n/*\n  X-Robots-Tag: noindex, nofollow\n');
  }}]};
})
