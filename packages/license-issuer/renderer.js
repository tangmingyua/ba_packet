const machineEl = document.getElementById('machineId');
const licenseEl = document.getElementById('license');
const issueBtn = document.getElementById('issue');
const copyBtn = document.getElementById('copyLicense');
const issueMsg = document.getElementById('issueMsg');
const fpEl = document.getElementById('fp');
const matchEl = document.getElementById('match');

async function refreshStatus() {
  const status = await window.licenseIssuer.status();
  fpEl.textContent = status.fingerprint || '未知';
  if (status.matchesApp) {
    matchEl.className = 'ok';
    matchEl.textContent = '与程序内置公钥一致，可直接签发。';
  } else {
    matchEl.className = 'warn';
    matchEl.textContent =
      '当前私钥与程序内置公钥不一致。若这是新生成的密钥，需要把公钥更新进程序后才能激活。';
  }
}

issueBtn.addEventListener('click', async () => {
  issueMsg.textContent = '';
  issueMsg.className = 'msg';
  try {
    const { code } = await window.licenseIssuer.issue(machineEl.value);
    licenseEl.value = code;
    issueMsg.className = 'msg ok';
    issueMsg.textContent = '已生成，请复制发给对方。';
  } catch (error) {
    issueMsg.className = 'msg warn';
    issueMsg.textContent = error?.message || '签发失败';
  }
});

copyBtn.addEventListener('click', async () => {
  const text = licenseEl.value.trim();
  if (!text) return;
  await window.licenseIssuer.copy(text);
  copyBtn.textContent = '已复制';
  setTimeout(() => {
    copyBtn.textContent = '复制';
  }, 1200);
});

refreshStatus().catch((error) => {
  matchEl.className = 'warn';
  matchEl.textContent = error?.message || '无法读取密钥';
});
