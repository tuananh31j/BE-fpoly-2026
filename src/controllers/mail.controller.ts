import { StatusCodes } from 'http-status-codes';

import { sendMail } from '@services/mail.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { sendSuccess } from '@utils/response';

export const sendTestMailController = asyncHandler(async (req, res) => {
  const recipient = req.body?.to ?? req.user?.email;

  if (!recipient) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Recipient email is required');
  }

  const sent = await sendMail({
    to: recipient,
    subject: '[Golden Billiards] Test SMTP Email',
    text: `Xin chào,\n\nĐây là email kiểm tra dịch vụ gửi mail của Golden Billiards.\nThời gian gửi: ${new Date().toISOString()}\n\nNếu bạn nhận được email này, cấu hình SMTP đang hoạt động tốt.`,
    html: `
<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <title>Golden Billiards Mail Test</title>
  </head>
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#0f172a;color:#f8fafc;padding:20px 24px;font-size:18px;font-weight:700;">
          Golden Billiards - SMTP Test
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 12px;line-height:1.6;">
            Xin chào, đây là email kiểm tra dịch vụ gửi mail.
          </p>
          <p style="margin:0 0 12px;line-height:1.6;">
            Nếu bạn nhận được email này thì cấu hình SMTP đang hoạt động bình thường.
          </p>
          <p style="margin:0;color:#475569;font-size:13px;">
            Sent at: ${new Date().toISOString()}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
  });

  if (!sent) {
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Mailer is unavailable or failed to send email'
    );
  }

  return sendSuccess(res, {
    message: 'Test email sent successfully',
    data: {
      to: recipient
    }
  });
});
