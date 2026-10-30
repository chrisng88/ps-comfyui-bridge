const photoshop = require("photoshop");
const { app, core, action } = photoshop;
const uxpFs = require("uxp").storage.localFileSystem;
const formats = require("uxp").storage.formats;

const statusEl = document.getElementById("status");
const comfyUrlInput = document.getElementById("comfyUrl");
const workflowFileInput = document.getElementById("workflowFile");
const btnExportSend = document.getElementById("btnExportSend");
const btnFetchLatest = document.getElementById("btnFetchLatest");

// 任务列表：每点一次第 1 步新增一条，用文档 id（不是文件名）记录它来自哪个文档
// { docId, docName, promptId, status: "pending" | "done" | "error", polling }
const tasks = [];

// Photoshop 同一时间只允许一个 executeAsModal，多个任务的导出/置入排队执行
let modalChain = Promise.resolve();
function runModal(fn, options) {
  const p = modalChain.then(() => core.executeAsModal(fn, options));
  modalChain = p.catch(() => {});
  return p;
}

function log(msg, cls) {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = `[${time}] ${msg}`;
  statusEl.appendChild(line);
  statusEl.scrollTop = statusEl.scrollHeight;
  console.log(msg);
}

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "ps-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

async function getTempFolder() {
  return await uxpFs.getTemporaryFolder();
}

// ---------- 1. 导出当前文档 -> 上传 ComfyUI -> 提交工作流 ----------
async function exportAndSend() {
  const comfyUrl = comfyUrlInput.value.trim().replace(/\/$/, "");
  const wfName = workflowFileInput.value.trim();

  try {
    if (!app.activeDocument) {
      log("没有打开的文档", "err");
      return;
    }

    const doc = app.activeDocument;
    const docId = doc.id;
    const docName = doc.name;
    // 文件名带文档 id + 时间戳：ComfyUI 是排到才读图，重名会导致前一张被后一张覆盖
    const uploadName = `ps_export_${docId}_${Date.now()}.jpg`;

    log(`正在导出「${docName}」为 JPG…`);
    const tempFolder = await getTempFolder();
    let exportFile;

    await runModal(
      async () => {
        exportFile = await tempFolder.createFile(uploadName, { overwrite: true });
        await doc.saveAs.jpg(exportFile, { quality: 12 }, true);
      },
      { commandName: "导出JPG给ComfyUI" }
    );
    log("导出完成: " + exportFile.nativePath, "ok");

    // 读取文件二进制
    const data = await exportFile.read({ format: formats.binary });

    // 上传到 ComfyUI /upload/image
    log("正在上传图片到 ComfyUI…");
    const formData = new FormData();
    formData.append("image", new Blob([data], { type: "image/jpeg" }), uploadName);
    formData.append("type", "input");
    formData.append("overwrite", "true");

    const uploadRes = await fetch(`${comfyUrl}/upload/image`, {
      method: "POST",
      body: formData,
    });
    if (!uploadRes.ok) throw new Error("上传失败: " + uploadRes.status);
    const uploadJson = await uploadRes.json();
    const uploadedName = uploadJson.name;
    log("上传成功，ComfyUI 文件名: " + uploadedName, "ok");

    // 读取本地 workflow_api.json
    const pluginFolder = await uxpFs.getPluginFolder();
    let wfEntry;
    try {
      wfEntry = await pluginFolder.getEntry(wfName);
    } catch (e) {
      throw new Error(
        `找不到 ${wfName}，请先在 ComfyUI 里打开你的工作流，开启 Dev Mode，点击 "Save (API Format)" 导出后放到插件目录`
      );
    }
    const wfText = await wfEntry.read();
    const workflow = JSON.parse(wfText);

    // 自动找到 LoadImage 节点，填入刚上传的文件名
    let foundLoadImage = false;
    for (const nodeId in workflow) {
      const node = workflow[nodeId];
      if (node.class_type === "LoadImage") {
        node.inputs.image = uploadedName;
        foundLoadImage = true;
        break;
      }
    }
    if (!foundLoadImage) {
      log("警告: 未在 workflow_api.json 中找到 LoadImage 节点，请手动检查工作流", "err");
    }

    // 提交任务
    const clientId = uuid();
    log("正在提交任务到 ComfyUI 队列…");
    const promptRes = await fetch(`${comfyUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });
    if (!promptRes.ok) {
      const errText = await promptRes.text();
      throw new Error("提交任务失败: " + errText);
    }
    const promptJson = await promptRes.json();
    const task = { docId, docName, promptId: promptJson.prompt_id, status: "pending", polling: false };
    tasks.push(task);
    log(`「${docName}」任务已提交，prompt_id = ${task.promptId}`, "ok");
    log("处理完成后会自动置入原文档，可以继续处理下一张");

    // 后台自动轮询 + 置入，不阻塞，可以立刻切换到下一张图再点第 1 步
    pollAndPlace(task, comfyUrl);
  } catch (err) {
    log("出错: " + err.message, "err");
  }
}

// ---------- 2. 轮询结果 -> 下载 -> 置入对应文档 ----------
// 第 1 步提交后会自动调用；第 2 步按钮只是手动补跑（超时或面板重开后用）
async function fetchLatestAndPlace() {
  const comfyUrl = comfyUrlInput.value.trim().replace(/\/$/, "");
  const waiting = tasks.filter((t) => t.status === "pending" && !t.polling);
  if (waiting.length === 0) {
    log("没有需要手动拉取的任务（进行中的任务会自动置入）");
    return;
  }
  waiting.forEach((t) => pollAndPlace(t, comfyUrl));
}

function findDocById(id) {
  for (const d of app.documents) {
    if (d.id === id) return d;
  }
  return null;
}

async function pollAndPlace(task, comfyUrl) {
  if (task.polling) return;
  task.polling = true;
  const tag = `「${task.docName}」`;

  try {
    log(`${tag} 等待 ComfyUI 处理…`);
    const maxTries = 300; // 3 秒一次，最长约 15 分钟（云端多张排队时需要更久）
    let outputs = null;

    for (let i = 0; i < maxTries; i++) {
      try {
        const histRes = await fetch(`${comfyUrl}/history/${task.promptId}`);
        const histJson = await histRes.json();
        if (histJson[task.promptId]) {
          outputs = histJson[task.promptId].outputs;
          break;
        }
      } catch (e) {
        // 网络抖动，继续重试
      }
      await new Promise((r) => setTimeout(r, 3000));
      if (i > 0 && i % 10 === 0) log(`${tag} 仍在处理中…已等待 ${i * 3} 秒`);
    }

    if (!outputs) {
      log(`${tag} 超时：还未返回结果，可稍后点第 2 步重试`, "err");
      return;
    }

    // 找到第一个带 images 输出的节点
    let imgInfo = null;
    for (const nodeId in outputs) {
      const out = outputs[nodeId];
      if (out.images && out.images.length > 0) {
        imgInfo = out.images[0];
        break;
      }
    }
    if (!imgInfo) {
      task.status = "error";
      log(`${tag} 没有在输出中找到图片，请检查工作流是否包含 SaveImage 节点`, "err");
      return;
    }

    log(`${tag} 找到结果图: ${imgInfo.filename}，正在下载…`);
    const viewUrl = `${comfyUrl}/view?filename=${encodeURIComponent(
      imgInfo.filename
    )}&subfolder=${encodeURIComponent(imgInfo.subfolder || "")}&type=${imgInfo.type}`;
    const imgRes = await fetch(viewUrl);
    if (!imgRes.ok) throw new Error("下载结果图失败: " + imgRes.status);
    const arrayBuffer = await imgRes.arrayBuffer();

    const tempFolder = await getTempFolder();
    const outFile = await tempFolder.createFile(`comfy_result_${task.promptId}.png`, { overwrite: true });
    await outFile.write(arrayBuffer, { format: formats.binary });

    // 置入原文档（按文档 id 找，自动切换到对应标签页）
    // 关键点：batchPlay 需要的是 session token，不是原始文件路径字符串
    try {
      const targetDoc = findDocById(task.docId);
      if (!targetDoc) throw new Error("原文档已关闭");
      const sessionToken = await uxpFs.createSessionToken(outFile);
      await runModal(
        async () => {
          app.activeDocument = targetDoc;
          await action.batchPlay(
            [
              {
                _obj: "placeEvent",
                null: {
                  _path: sessionToken,
                  _kind: "local",
                },
              },
            ],
            { synchronousExecution: true }
          );
        },
        { commandName: "置入 ComfyUI 结果" }
      );
      task.status = "done";
      log(`${tag} 已自动置入原文档，可以开始精修了`, "ok");
    } catch (placeErr) {
      log(`${tag} 置入图层失败: ${placeErr.message}，改为直接打开为新文档`, "err");
      await runModal(async () => { await app.open(outFile); }, { commandName: "打开 ComfyUI 结果" });
      task.status = "done";
      log(`${tag} 已作为新文档打开`, "ok");
    }
  } catch (err) {
    log(`${tag} 出错: ${err.message}`, "err");
  } finally {
    task.polling = false;
  }
}

btnExportSend.addEventListener("click", exportAndSend);
btnFetchLatest.addEventListener("click", fetchLatestAndPlace);
