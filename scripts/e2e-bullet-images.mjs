// Guest-only browser test with real OCR. Run against the local Vite app.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try {
  for (const viewport of [{width:1280,height:850},{width:390,height:844}]) {
    const page=await browser.newPage({viewport});
    await page.goto((process.env.IMAGE_TEST_URL||'http://127.0.0.1:5234')+'/#app');
    const row=page.locator('.outline-row').filter({has:page.getByRole('button',{name:'Ideas',exact:true})}).first();
    await row.waitFor();
    const id=await row.getAttribute('data-node-id');
    async function drop(type) {
      await row.evaluate(async(element,type)=>{
        const canvas=document.createElement('canvas');
        canvas.width=920;
        canvas.height=250;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle=type==='file'?'#101010':'white';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle=type==='file'?'#ffffff':'black';
        ctx.font='64px Arial';
        ctx.fillText('Photosynthesis',42,100);
        ctx.font='42px Arial';
        ctx.fillText('Plants use light to make sugar.',42,185);
        const transfer=new DataTransfer();
        if(type==='file'){
          const sideways=document.createElement('canvas');
          sideways.width=canvas.height;
          sideways.height=canvas.width;
          const rotated=sideways.getContext('2d');
          rotated.translate(0,canvas.width);
          rotated.rotate(-Math.PI/2);
          rotated.drawImage(canvas,0,0);
          const blob=await new Promise(resolve=>sideways.toBlob(resolve));
          transfer.items.add(new File([blob],'science.png',{type:'image/png'}));
        }else{
          transfer.setData('text/html',`<img src="${canvas.toDataURL()}" alt="study image">`);
        }
        element.dispatchEvent(new DragEvent('dragover',{dataTransfer:transfer,bubbles:true,cancelable:true}));
        if(!element.classList.contains('image-drop-target'))throw Error('Drop target not highlighted');
        element.dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
        if(element.classList.contains('image-drop-target'))throw Error('Drop highlight remained');
      },type);
    }
    await drop('file');
    await row.getByRole('button',{name:'Extract text',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.save-status')?.title.includes('Saved'));
    await drop('html');
    await page.waitForFunction(id=>document.querySelector(`[data-node-id="${id}"]`).querySelectorAll('figure.note-image').length===2,id);
    await row.getByRole('button',{name:'Extract text',exact:true}).first().click();
    const dialog=page.getByRole('dialog',{name:'Extract text from image'});
    const draft=dialog.getByRole('textbox',{name:'Extracted text'});
    await dialog.getByRole('button',{name:'Rotate 90°'}).click();
    await dialog.getByRole('button',{name:'Invert'}).click();
    await dialog.getByRole('button',{name:'Crop',exact:true}).click();
    // Keyboard crop controls must select the heading without the lower line.
    const bottom=dialog.getByRole('slider',{name:'Bottom edge (%)'});
    await bottom.focus();
    for(let step=0;step<48;step++)await bottom.press('ArrowLeft');
    await dialog.getByLabel('Text layout').selectOption('block');
    await dialog.getByRole('button',{name:'Extract text',exact:true}).click();
    await dialog.getByText('Text extracted.',{exact:true}).waitFor({timeout:90000});
    assert.match(await draft.inputValue(),/Photosynthesis/i);
    assert.doesNotMatch(await draft.inputValue(),/Plants use light/i);
    const edited='Photosynthesis\nPlants turn light into chemical energy.';
    await draft.fill(edited);
    await dialog.getByRole('button',{name:'Reset crop'}).click();
    await dialog.getByRole('button',{name:'Run again'}).click();
    const newResult=dialog.getByRole('textbox',{name:'New OCR result'});
    await newResult.waitFor({timeout:90000});
    assert.match(await newResult.inputValue(),/Plants use light to make sugar/i);
    assert.equal(await draft.inputValue(),edited,'retry must preserve the edited text');
    await dialog.getByRole('button',{name:'Keep my edits'}).click();
    await dialog.getByRole('button',{name:'Copy text'}).click();
    await dialog.getByText(/Copied text|Text selected/).waitFor();
    await page.getByRole('button',{name:'Add as child bullet'}).click();
    await page.getByRole('dialog',{name:'Extract text from image'}).waitFor({state:'detached'});
    await page.reload();
    await page.waitForFunction(async({id})=>{
      const {load}=await import('/src/data.ts'),doc=await load();
      return doc.tables.bullets.some(n=>n.parentId===id&&n.text==='Photosynthesis\nPlants turn light into chemical energy.')&&doc.tables.media.filter(m=>m.bulletId===id).length===2;
    },{id});
    console.log(`${viewport.width}px: file/HTML drop, crop/rotate/invert OCR, safe retry, copy and persistence`);
    await page.close();
  }
} finally {await browser.close();}
