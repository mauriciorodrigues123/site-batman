// Elementos do DOM
const paymentForm = document.getElementById('payment-form');
const paymentInfo = document.getElementById('payment-info');
const emailInput = document.getElementById('email');
const confirmEmailInput = document.getElementById('confirm-email');
const generatePixBtn = document.getElementById('generate-pix');
const qrcodeImg = document.getElementById('qrcode');
const pixCodeInput = document.getElementById('pix-code');
const copyPixBtn = document.getElementById('copy-pix');
const statusText = document.getElementById('status-text');
const statusLoader = document.getElementById('status-loader');
const newPaymentBtn = document.getElementById('new-payment');
const notificationArea = document.getElementById('notification-area');

// Variáveis globais
let paymentId = null;
let checkStatusInterval = null;
let userEmail = null;

// Validação de email
emailInput.addEventListener('input', validateEmail);
confirmEmailInput.addEventListener('input', validateEmails);

function validateEmail() {
    const email = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);

    if (email === '') {
        emailInput.classList.remove('input-error', 'input-success');
        emailInput.nextElementSibling.style.display = 'none';
    } else if (!isValid) {
        emailInput.classList.add('input-error');
        emailInput.classList.remove('input-success');
        emailInput.nextElementSibling.style.display = 'block';
    } else {
        emailInput.classList.add('input-success');
        emailInput.classList.remove('input-error');
        emailInput.nextElementSibling.style.display = 'none';
        validateEmails();
    }
}

function validateEmails() {
    const email = emailInput.value.trim();
    const confirmEmail = confirmEmailInput.value.trim();

    if (confirmEmail === '') {
        confirmEmailInput.classList.remove('input-error', 'input-success');
        confirmEmailInput.nextElementSibling.style.display = 'none';
        return;
    }

    if (email !== confirmEmail) {
        confirmEmailInput.classList.add('input-error');
        confirmEmailInput.classList.remove('input-success');
        confirmEmailInput.nextElementSibling.style.display = 'block';
    } else {
        confirmEmailInput.classList.add('input-success');
        confirmEmailInput.classList.remove('input-error');
        confirmEmailInput.nextElementSibling.style.display = 'none';
    }
}

// Função para mostrar notificações
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    notification.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
    notificationArea.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-10px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Evento para gerar PIX
generatePixBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const confirmEmail = confirmEmailInput.value.trim();

    if (!email || !confirmEmail || email !== confirmEmail) {
        showNotification('Verifique seus emails antes de gerar o PIX.', 'error');
        return;
    }

    userEmail = email;

    generatePixBtn.innerHTML = '<span class="spinner"></span> Gerando PIX...';
    generatePixBtn.classList.add('btn-loading');
    generatePixBtn.disabled = true;

    try {
        const response = await fetch('/api/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 0.10, email })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro ao gerar PIX');

        paymentId = data.payment_id;

        // Salvar no localStorage para persistência
        localStorage.setItem('paymentId', paymentId);
        localStorage.setItem('userEmail', userEmail);
        localStorage.setItem('pixCodeBase64', data.pix_code_base64);

        qrcodeImg.src = `data:image/png;base64,${data.pix_code_base64}`;
        pixCodeInput.value = data.pix_code;

        paymentForm.style.display = 'none';
        paymentInfo.style.display = 'block';

        showNotification('QR Code PIX gerado com sucesso! Escaneie para realizar o pagamento.', 'success');

        checkPaymentStatus();
    } catch (error) {
        showNotification(`Erro: ${error.message}`, 'error');
        generatePixBtn.innerHTML = '<i class="fas fa-qrcode"></i> Gerar PIX';
        generatePixBtn.classList.remove('btn-loading');
        generatePixBtn.disabled = false;
    }
});

// Verificar status do pagamento
async function checkPaymentStatus() {
    if (!paymentId) return;

    checkStatusInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/payment-status/${paymentId}`);
            const data = await response.json();

            if (data.status === 'approved') {
                clearInterval(checkStatusInterval);
                showPaymentConfirmed();
            }
        } catch (error) {
            console.error('Erro ao verificar status:', error);
        }
    }, 3000);
}

// Mostrar pagamento confirmado
function showPaymentConfirmed() {
    statusText.textContent = 'Pagamento confirmado com sucesso!';
    statusText.classList.add('success');
    statusLoader.style.display = 'none';

    const qrcodeContainer = document.getElementById('qrcode-container');
    const overlay = document.createElement('div');
    overlay.className = 'qrcode-overlay';
    overlay.innerHTML = '<i class="fas fa-check-circle"></i> Pagamento Confirmado';
    qrcodeContainer.appendChild(overlay);

    showNotification('Pagamento confirmado com sucesso! Um email de confirmação foi enviado.', 'success');

    sendConfirmationEmailToUser(userEmail);

    // Limpar localStorage após confirmação
    localStorage.removeItem('paymentId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('pixCodeBase64');
}

// Copiar PIX
copyPixBtn.addEventListener('click', () => {
    pixCodeInput.select();
    document.execCommand('copy');
    showNotification('Código PIX copiado!', 'success');
});

// Novo pagamento
newPaymentBtn.addEventListener('click', () => {
    if (checkStatusInterval) clearInterval(checkStatusInterval);

    emailInput.value = '';
    confirmEmailInput.value = '';
    emailInput.classList.remove('input-error', 'input-success');
    confirmEmailInput.classList.remove('input-error', 'input-success');
    statusText.textContent = 'Aguardando pagamento';
    statusText.classList.remove('success', 'error');
    statusLoader.style.display = 'block';
    generatePixBtn.innerHTML = '<i class="fas fa-qrcode"></i> Gerar PIX';
    generatePixBtn.classList.remove('btn-loading');
    generatePixBtn.disabled = false;
    notificationArea.innerHTML = '';
    paymentForm.style.display = 'block';
    paymentInfo.style.display = 'none';

    paymentId = null;
    userEmail = null;

    // Limpar localStorage
    localStorage.removeItem('paymentId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('pixCodeBase64');
});

// Enviar email de confirmação
async function sendConfirmationEmailToUser(email) {
    if (!email) return;

    try {
        await fetch('/api/send-confirmation-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
    } catch (error) {
        console.error('Erro ao enviar email de confirmação:', error);
        showNotification('Erro ao enviar o email de confirmação.', 'error');
    }
}

// ✅ Recuperar pagamento pendente no carregamento da página
window.addEventListener('load', () => {
    const savedPaymentId = localStorage.getItem('paymentId');
    const savedEmail = localStorage.getItem('userEmail');
    const savedPixCode = localStorage.getItem('pixCodeBase64');

    if (savedPaymentId && savedEmail && savedPixCode) {
        paymentId = savedPaymentId;
        userEmail = savedEmail;
        qrcodeImg.src = `data:image/png;base64,${savedPixCode}`;

        paymentForm.style.display = 'none';
        paymentInfo.style.display = 'block';

        checkPaymentStatus();
    }
});
