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
app.use(cors());                    // Permite requisições de outros domínios
app.use(express.json());            // Permite receber dados em formato JSON
app.use(express.static('public'));  // Serve arquivos estáticos da pasta 'public'

// Configuração do Mercado Pago
mercadopago.configure({
    access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
    sandbox: process.env.MERCADOPAGO_SANDBOX === 'true'
});

// Configuração do serviço de email
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
                        <a href="https://drive.google.com/drive/folders/1AMYsrQMYODw9i1l8zthuHm7WjO247oby" 
                           style="display: inline-block; background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Acessar Conteúdo
                        </a>
                    </p>
                    <p style="margin-top: 20px; font-size: 14px;">Link direto: <a href="https://drive.google.com/drive/u/0/mobile/folders/1JPCtkMZrAoN1XujYbPrO1PjEhR43VgwM?usp=drive_link">Clique aqui</a></p>
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
        // Valor fixo de 10.00, ignorando o que foi enviado pelo cliente
        const amount = 10.00;

        // Validar dados recebidos
        if (!email) {
            return res.status(400).json({
                error: 'Email é obrigatório'
            });
        }

        // Validar formato do email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Email inválido'
            });
        }

        // Criar pagamento PIX no Mercado Pago
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

        // Retornar dados do PIX para o cliente
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

// Rota para verificar status do pagamento
app.get('/api/payment-status/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        const result = await mercadopago.payment.findById(paymentId);
        
        // Se o pagamento estiver aprovado, enviar email
        if (result.body.status === 'approved') {
            const email = result.body.payer.email;
            await sendConfirmationEmail(email);
            console.log(`Email de confirmação enviado para: ${email}`);
        }
        
        res.json({
            success: true,
            payment_id: result.body.id,
            status: result.body.status,
            status_detail: result.body.status_detail
        });

    } catch (error) {
        console.error('Erro ao verificar status:', error);
        
        res.status(500).json({
            error: 'Erro ao verificar status do pagamento',
            message: error.message
        });
    }
});

// Rota para enviar email manualmente
app.post('/api/send-confirmation-email', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                error: 'Email é obrigatório'
            });
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

// Rota para webhook do Mercado Pago (confirmação de pagamento)
app.post('/api/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;
        
        console.log('Webhook recebido:', { type, data });
        
        if (type === 'payment') {
            console.log('Pagamento confirmado:', data.id);
            
            // Buscar informações do pagamento para obter o email
            const paymentInfo = await mercadopago.payment.findById(data.id);
            const email = paymentInfo.body.payer.email;
            
            // Enviar email de confirmação com o link de acesso
            await sendConfirmationEmail(email);
            console.log(`Email de confirmação enviado para: ${email}`);
        }
        
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Erro no webhook:', error);
        res.status(500).json({ error: 'Erro no webhook' });
    }
});

// Rota para testar o envio de email
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