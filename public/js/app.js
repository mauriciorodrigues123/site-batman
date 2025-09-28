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
let lastCheckTime = 0;
let checkCount = 0;
let paymentConfirmed = false;

// Salvar dados de pagamento no localStorage
function savePaymentData() {
    if (paymentId) {
        localStorage.setItem('paymentId', paymentId);
        localStorage.setItem('userEmail', userEmail);
        localStorage.setItem('paymentTime', Date.now().toString());
        localStorage.setItem('paymentConfirmed', 'false');
    }
}

// Recuperar dados de pagamento do localStorage
function loadPaymentData() {
    const savedPaymentId = localStorage.getItem('paymentId');
    const savedUserEmail = localStorage.getItem('userEmail');
    const savedConfirmed = localStorage.getItem('paymentConfirmed');
    
    if (savedPaymentId) {
        paymentId = savedPaymentId;
        userEmail = savedUserEmail;
        paymentConfirmed = savedConfirmed === 'true';
        
        // Se o pagamento já foi confirmado, mostrar a confirmação
        if (paymentConfirmed) {
            paymentForm.style.display = 'none';
            paymentInfo.style.display = 'block';
            showPaymentConfirmed();
            return true;
        }
        
        // Verificar se o pagamento foi iniciado há menos de 24 horas
        const paymentTime = parseInt(localStorage.getItem('paymentTime') || '0');
        const now = Date.now();
        const hoursSincePayment = (now - paymentTime) / (1000 * 60 * 60);
        
        if (hoursSincePayment < 24) {
            // Restaurar a interface de pagamento
            paymentForm.style.display = 'none';
            paymentInfo.style.display = 'block';
            return true;
        } else {
            // Pagamento muito antigo, limpar dados
            clearPaymentData();
            return false;
        }
    }
    return false;
}

// Limpar dados de pagamento do localStorage
function clearPaymentData() {
    localStorage.removeItem('paymentId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('paymentTime');
    localStorage.removeItem('paymentConfirmed');
}

// Verificar pagamento ao carregar a página
window.addEventListener('load', () => {
    // Verificar se há um pagamento em andamento
    if (loadPaymentData() && !paymentConfirmed) {
        // Restaurar QR code se possível
        checkPaymentStatus(true);
    }
});

// Evento para quando a página fica visível novamente
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Se a página estava com um pagamento em andamento
        if ((paymentInfo.style.display === 'block' || loadPaymentData()) && !paymentConfirmed) {
            // Verificar se passou tempo suficiente desde a última verificação
            const now = Date.now();
            if (now - lastCheckTime > 5000) { // 5 segundos entre verificações
                lastCheckTime = now;
                checkPaymentStatus(true);
            }
        }
    }
});

// Evento para gerar o PIX
generatePixBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const confirmEmail = confirmEmailInput.value.trim();
    const amount = 0.10; // Valor fixo

    // Validações
    if (!email) {
        emailInput.classList.add('input-error');
        emailInput.focus();
        showNotification('Por favor, preencha seu email antes de gerar o PIX.', 'error');
        return;
    }

    if (!confirmEmail) {
        confirmEmailInput.classList.add('input-error');
        confirmEmailInput.focus();
        showNotification('Por favor, confirme seu email antes de gerar o PIX.', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        emailInput.classList.add('input-error');
        emailInput.focus();
        showNotification('Por favor, insira um email válido.', 'error');
        return;
    }

    if (email !== confirmEmail) {
        confirmEmailInput.classList.add('input-error');
        confirmEmailInput.focus();
        showNotification('Os emails não coincidem. Por favor, verifique.', 'error');
        return;
    }

    // Salvar email do usuário
    userEmail = email;

    // Mostrar loader
    generatePixBtn.innerHTML = '<span class="spinner"></span> Gerando PIX...';
    generatePixBtn.classList.add('btn-loading');
    generatePixBtn.disabled = true;

    try {
        // Criar pagamento PIX
        const response = await fetch('/api/create-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, email })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Erro ao gerar PIX');

        // Salvar ID do pagamento
        paymentId = data.payment_id;
        
        // Salvar dados no localStorage
        savePaymentData();

        // Exibir QR Code e código PIX
        qrcodeImg.src = `data:image/png;base64,${data.pix_code_base64}`;
        pixCodeInput.value = data.pix_code;

        // Mostrar informações de pagamento
        paymentForm.style.display = 'none';
        paymentInfo.style.display = 'block';

        showNotification('QR Code PIX gerado com sucesso! Escaneie para realizar o pagamento.', 'success');

        // Iniciar verificação de status
        checkPaymentStatus();

    } catch (error) {
        showNotification(`Erro: ${error.message}`, 'error');
        generatePixBtn.innerHTML = '<i class="fas fa-qrcode"></i> Gerar PIX';
        generatePixBtn.classList.remove('btn-loading');
        generatePixBtn.disabled = false;
    }
});

// Função para verificar status do pagamento
async function checkPaymentStatus(isRetry = false) {
    if (!paymentId) return;

    // Limpar intervalo anterior se existir
    if (checkStatusInterval) {
        clearInterval(checkStatusInterval);
        checkStatusInterval = null;
    }

    if (!isRetry) {
        showNotification('Verificando status do pagamento...', 'info');
    }

    lastCheckTime = Date.now();
    checkCount++;

    // Verificar imediatamente uma vez
    try {
        const response = await fetch(`/api/payment-status/${paymentId}?t=${Date.now()}`);
        const data = await response.json();

        if (data.status === 'approved') {
            paymentConfirmed = true;
            localStorage.setItem('paymentConfirmed', 'true');
            showPaymentConfirmed();
            return;
        }
    } catch (error) {
        console.error('Erro ao verificar status:', error);
    }

    // Configurar intervalo para verificações contínuas com tempo maior para ambiente de produção
    const isProduction = window.location.hostname !== 'localhost';
    const checkInterval = isProduction ? 10000 : 3000; // 10 segundos em produção, 3 segundos em localhost
    
    checkStatusInterval = setInterval(async () => {
        try {
            // Adicionar timestamp para evitar cache
            const response = await fetch(`/api/payment-status/${paymentId}?t=${Date.now()}`);
            const data = await response.json();

            lastCheckTime = Date.now();
            checkCount++;

            if (data.status === 'approved') {
                clearInterval(checkStatusInterval);
                checkStatusInterval = null;
                paymentConfirmed = true;
                localStorage.setItem('paymentConfirmed', 'true');
                showPaymentConfirmed();
            }

        } catch (error) {
            console.error('Erro ao verificar status:', error);
        }
    }, checkInterval);
}

// Função para mostrar confirmação de pagamento
function showPaymentConfirmed() {
    statusText.textContent = 'Pagamento confirmado com sucesso!';
    statusText.classList.add('success');
    statusLoader.style.display = 'none';

    const qrcodeContainer = document.getElementById('qrcode-container');
    if (qrcodeContainer) {
        // Verificar se o overlay já existe
        if (!qrcodeContainer.querySelector('.qrcode-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'qrcode-overlay';
            overlay.innerHTML = '<i class="fas fa-check-circle"></i> Pagamento Confirmado';
            qrcodeContainer.appendChild(overlay);
        }
    }

    showNotification('Pagamento confirmado com sucesso! Um email de confirmação foi enviado.', 'success');

    // Tentar enviar email várias vezes
    sendConfirmationEmailWithRetry(userEmail, 3);
}

// Função para enviar email com várias tentativas
async function sendConfirmationEmailWithRetry(email, maxRetries = 3, currentRetry = 0, delay = 2000) {
    if (!email || currentRetry >= maxRetries) return;

    setTimeout(async () => {
        try {
            const response = await fetch('/api/send-confirmation-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            if (!response.ok) {
                // Aumentar o atraso exponencialmente para cada nova tentativa
                const nextDelay = delay * 2;
                sendConfirmationEmailWithRetry(email, maxRetries, currentRetry + 1, nextDelay);
            } else {
                console.log(`Email enviado com sucesso na tentativa ${currentRetry + 1}`);
            }
        } catch (error) {
            console.error(`Erro ao enviar email (tentativa ${currentRetry + 1}):`, error);
            // Aumentar o atraso exponencialmente para cada nova tentativa
            const nextDelay = delay * 2;
            sendConfirmationEmailWithRetry(email, maxRetries, currentRetry + 1, nextDelay);
        }
    }, delay);
}

// Evento para novo pagamento
newPaymentBtn.addEventListener('click', () => {
    if (checkStatusInterval) {
        clearInterval(checkStatusInterval);
        checkStatusInterval = null;
    }
    
    // Limpar dados do localStorage
    clearPaymentData();
    paymentConfirmed = false;
    checkCount = 0;
    
    // Resetar formulário
    emailInput.value = '';
    confirmEmailInput.value = '';
    emailInput.classList.remove('input-error', 'input-success');
    confirmEmailInput.classList.remove('input-error', 'input-success');
    emailInput.nextElementSibling.style.display = 'none';
    confirmEmailInput.nextElementSibling.style.display = 'none';
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
});
