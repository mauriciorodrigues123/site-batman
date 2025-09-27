// Importação das bibliotecas necessárias
const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const path = require('path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config();

// Inicialização do aplicativo Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração do Mercado Pago
mercadopago.configure({
    access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
    sandbox: process.env.MERCADOPAGO_SANDBOX === 'true'
});

// ---------- MAPA DE STATUS (em memória) ----------
const paymentStatuses = new Map();

// ---------- Configuração do serviço de email ----------
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Função para enviar email de confirmação com link de acesso
async function sendConfirmationEmail(email) {
    try {
        console.log(`Tentando enviar email para: ${email}`);

        const mailOptions = {
            from: `"Confirmação de Pagamento" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Obrigado pela preferência!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
                    <h2 style="color: #333;">Obrigado pela preferência!</h2>
                    <p style="font-size: 16px; line-height: 1.5;">Seu pagamento foi confirmado com sucesso.</p>
                    <p style="font-size: 16px; line-height: 1.5;">Aqui está seu link de acesso:</p>
                    <p style="text-align: center;">
                        <a href="https://drive.google.com/drive/folders/1AMYsrQMYODw9i1l8zthuHm7WjO247oby?usp=drive_link" 
                           style="display: inline-block; background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Acessar Conteúdo
                        </a>
                    </p>
                    <p style="margin-top: 20px; font-size: 14px;">Link direto: <a href="https://drive.google.com/drive/folders/1AMYsrQMYODw9i1l8zthuHm7WjO247oby?usp=drive_link">Clique aqui</a></p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email enviado com sucesso:', info.response);
        return true;
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        return false;
    }
}

// Rota para criar pagamento PIX
app.post('/api/create-payment', async (req, res) => {
    try {
        const { email } = req.body;
        const amount = 0.10;

        if (!email) {
            return res.status(400).json({ error: 'Email é obrigatório' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        const paymentData = {
            transaction_amount: amount,
            description: `Pagamento PIX - ${email}`,
            payment_method_id: 'pix',
            payer: {
                email: email
            }
        };

        console.log('Criando pagamento PIX:', paymentData);

        const result = await mercadopago.payment.create(paymentData);

        console.log('Pagamento criado com sucesso:', result.body.id);

        // Armazenar status inicial no mapa
        paymentStatuses.set(result.body.id, result.body.status);

        res.json({
            success: true,
            payment_id: result.body.id,
            pix_code: result.body.point_of_interaction?.transaction_data?.qr_code,
            pix_code_base64: result.body.point_of_interaction?.transaction_data?.qr_code_base64,
            status: result.body.status
        });

    } catch (error) {
        console.error('Erro ao criar pagamento:', error);

        res.status(500).json({
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
});

// Rota para verificar status do pagamento (frontend consulta)
app.get('/api/payment-status/:paymentId', (req, res) => {
    const { paymentId } = req.params;
    const status = paymentStatuses.get(paymentId) || 'pending';
    res.json({
        success: true,
        payment_id: paymentId,
        status: status
    });
});

// Rota para webhook do Mercado Pago (confirmação de pagamento)
app.post('/api/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;

        console.log('Webhook recebido:', { type, data });

        if (type === 'payment') {
            console.log('Pagamento confirmado (webhook):', data.id);

            // Buscar informações do pagamento para obter email e status
            const paymentInfo = await mercadopago.payment.findById(data.id);
            const email = paymentInfo.body.payer.email;
            const status = paymentInfo.body.status;

            // Atualizar status no mapa
            paymentStatuses.set(data.id, status);

            // Se aprovado, enviar email
            if (status === 'approved') {
                await sendConfirmationEmail(email);
                console.log(`Email de confirmação enviado para: ${email}`);
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.sendStatus(500);
    }
});

// Rota para teste de envio de email manual
app.post('/api/send-confirmation-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email é obrigatório' });
        }

        console.log(`Recebida solicitação para enviar email para: ${email}`);

        const success = await sendConfirmationEmail(email);

        if (success) {
            res.json({
                success: true,
                message: `Email de confirmação enviado para: ${email}`
            });
        } else {
            res.status(500).json({
                error: 'Falha ao enviar email'
            });
        }
    } catch (error) {
        console.error('Erro ao enviar email:', error);
        res.status(500).json({
            error: 'Erro ao enviar email',
            message: error.message
        });
    }
});

// Rota para testar o envio de email (GET)
app.get('/api/test-email', async (req, res) => {
    try {
        const email = req.query.email || 'teste@exemplo.com';

        console.log(`Testando envio de email para: ${email}`);

        const success = await sendConfirmationEmail(email);

        if (success) {
            res.json({
                success: true,
                message: `Email de teste enviado para: ${email}`
            });
        } else {
            throw new Error('Falha ao enviar email de teste');
        }
    } catch (error) {
        console.error('Erro ao enviar email de teste:', error);
        res.status(500).json({
            error: 'Erro ao enviar email de teste',
            message: error.message
        });
    }
});

// Servir a página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
});
