const $ = (selector) => document.querySelector(selector);
const aiDialog = $('#ai-dialog');
const menuDialog = $('#menu-dialog');
const searchDialog = $('#search-dialog');
const openAi = () => { menuDialog.close(); aiDialog.showModal(); $('#chat-input').focus(); };
document.querySelectorAll('[data-open-ai]').forEach((button) => button.addEventListener('click', openAi));
$('#open-menu').addEventListener('click', () => menuDialog.showModal());
$('#open-menu-bottom').addEventListener('click', () => menuDialog.showModal());
$('#open-search').addEventListener('click', () => searchDialog.showModal());
document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('.mobile-links a').forEach((link) => link.addEventListener('click', () => menuDialog.close()));
const answers = {
  admissions: 'Admissions information is available on the Admissions page. Please contact the school office for verified application dates and eligibility details.',
  academics: 'NPS Digital Campus provides access to academic departments, subjects, faculty information and the academic calendar.',
  facilities: 'I do not have verified information about that.',
  notices: 'You can view the latest published school notices in the Notice Board section of this page.'
};
function reply(message) {
  const key = Object.keys(answers).find((term) => message.toLowerCase().includes(term));
  return key ? answers[key] : "I don't have verified information about that.";
}
function addMessage(text, type) { const item = document.createElement('div'); item.className = `message ${type}`; item.textContent = text; $('#chat').append(item); $('#chat').scrollTop = $('#chat').scrollHeight; }
$('#chat-form').addEventListener('submit', (event) => { event.preventDefault(); const input = $('#chat-input'); const text = input.value.trim(); if (!text) return; addMessage(text, 'user'); input.value = ''; setTimeout(() => addMessage(reply(text), 'bot'), 350); });
document.querySelectorAll('.suggestions button').forEach((button) => button.addEventListener('click', () => { addMessage(button.textContent, 'user'); setTimeout(() => addMessage(reply(button.textContent), 'bot'), 250); }));
$('.notice-tabs').addEventListener('click', (event) => { if (event.target.tagName !== 'BUTTON') return; document.querySelectorAll('.notice-tabs button').forEach((button) => button.classList.remove('selected')); event.target.classList.add('selected'); });
$('#search-input').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); const query = event.target.value.trim(); if (query) { searchDialog.close(); if (query.toLowerCase().includes('admission')) location.hash = 'admissions'; else if (query.toLowerCase().includes('notice')) location.hash = 'notices'; else if (query.toLowerCase().includes('academic')) location.hash = 'departments'; else location.hash = 'home'; } } });
const applicationDialog = $('#application-dialog');
$('#open-application').addEventListener('click', () => applicationDialog.showModal());
$('#application-form').addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; $('.form-status').textContent = 'Thank you. Your enquiry has been recorded locally for this demo.'; form.querySelector('button[type="submit"]').disabled = true; });
