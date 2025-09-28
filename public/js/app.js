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

// Salvar dados de pagamento no localStorage
function savePaymentData() {
    if (paymentId) {
        localStorage.setItem('paymentId', paymentId);
        localStorage.setItem('userEmail', userEmail);
    }
}

// Recuperar dados de pagamento do localStorage
function loadPaymentData() {
    const savedPaymentId = localStorage.getItem('paymentId');
    const savedUserEmail = localStorage.getItem('userEmail');
    
    if (savedPaymentId) {
        paymentId = savedPaymentId;
        userEmail = savedUserEmail;
        return true;
    }
    return false;
}

// Limpar dados de pagamento do localStorage
function clearPaymentData() {
    localStorage.removeItem('paymentId');
    localStorage.removeItem('userEmail');
}

// Evento para quando a página fica visível novamente
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Se a página estava com um pagamento em andamento
        if (paymentInfo.style.display === 'block' || loadPaymentData()) {
            // Se o intervalo foi interrompido, reiniciar a verificação
            if (!checkStatusInterval) {
                checkPaymentStatus();
                showNotification('Verificando status do pagamento...', 'info');
            }
        }
    }
});

// Validação em tempo real do email
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

    // Remover notificação após 5 segundos
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-10px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

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
async function checkPaymentStatus() {
    if (!paymentId) return;

    showNotification('Verificando status do pagamento...', 'info');

    // Limpar intervalo anterior se existir
    if (checkStatusInterval) {
        clearInterval(checkStatusInterval);
    }

    // Verificar imediatamente uma vez
    try {
        const response = await fetch(`/api/payment-status/${paymentId}`);
        const data = await response.json();

        if (data.status === 'approved') {
            clearPaymentData();
            showPaymentConfirmed();
            return;
        }
    } catch (error) {
        console.error('Erro ao verificar status:', error);
    }

    // Configurar intervalo para verificações contínuas com tempo maior para ambiente de produção
    const isProduction = window.location.hostname !== 'localhost';
    const checkInterval = isProduction ? 8000 : 3000; // 8 segundos em produção, 3 segundos em localhost
    
    checkStatusInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/payment-status/${paymentId}`);
            const data = await response.json();

            if (data.status === 'approved') {
                clearInterval(checkStatusInterval);
                checkStatusInterval = null;
                clearPaymentData();
                showPaymentConfirmed();
            }

        } catch (error) {
            console.error('Erro ao verificar status:', error);
        }
    }, checkInterval);
}

// Função para enviar email de confirmação
async function sendConfirmationEmailToUser(email) {
    if (!email) return;

    // Adicionar um pequeno atraso para dar tempo ao servidor de processar o pagamento
    const isProduction = window.location.hostname !== 'localhost';
    const delayTime = isProduction ? 2000 : 0; // 2 segundos de atraso em produção
    
    setTimeout(async () => {
        try {
            const response = await fetch('/api/send-confirmation-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            if (!response.ok) {
                // Se falhar, tentar novamente com um intervalo maior
                setTimeout(async () => {
                    try {
                        const retryResponse = await fetch('/api/send-confirmation-email', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        
                        if (!retryResponse.ok) {
                            // Tentar uma terceira vez com intervalo ainda maior
                            setTimeout(async () => {
                                try {
                                    await fetch('/api/send-confirmation-email', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ email })
                                    });
                                } catch (thirdError) {
                                    console.error('Erro na terceira tentativa de envio de email:', thirdError);
                                    showNotification('Houve um problema ao enviar o email de confirmação. Por favor, entre em contato conosco.', 'error');
                                }
                            }, 5000);
                        }
                    } catch (retryError) {
                        console.error('Erro na segunda tentativa de envio de email:', retryError);
                        showNotification('Houve um problema ao enviar o email de confirmação. Por favor, entre em contato conosco.', 'error');
                    }
                }, 3000);
            }

        } catch (error) {
            console.error('Erro ao enviar email de confirmação:', error);
            showNotification('Houve um problema ao enviar o email de confirmação. Por favor, entre em contato conosco.', 'error');
        }
    }, delayTime);
}

// Função para mostrar confirmação de pagamento
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
}

// Evento para copiar código PIX
copyPixBtn.addEventListener('click', () => {
    pixCodeInput.select();
    document.execCommand('copy');

    const originalText = copyPixBtn.innerHTML;
    copyPixBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
    showNotification('Código PIX copiado para a área de transferência!', 'success');

    setTimeout(() => {
        copyPixBtn.innerHTML = originalText;
    }, 2000);
});

// Evento para novo pagamento
newPaymentBtn.addEventListener('click', () => {
    if (checkStatusInterval) clearInterval(checkStatusInterval);
    checkStatusInterval = null;
    
    // Limpar dados do localStorage
    clearPaymentData();

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
