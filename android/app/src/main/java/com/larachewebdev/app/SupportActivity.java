package com.larachewebdev.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SupportActivity extends Activity {
    private static final String AI_ENDPOINT = "";
    private LinearLayout chatContainer;
    private ScrollView chatScroll;
    private EditText messageInput;
    private Button sendButton;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_support);

        chatContainer = findViewById(R.id.chatContainer);
        chatScroll = findViewById(R.id.chatScroll);
        messageInput = findViewById(R.id.messageInput);
        sendButton = findViewById(R.id.sendButton);

        findViewById(R.id.closeSupport).setOnClickListener(v -> finish());
        sendButton.setOnClickListener(v -> sendMessage());
        messageInput.setOnEditorActionListener((v, actionId, event) -> {
            sendMessage();
            return true;
        });

        addMessage("مرحباً 👋 أنا مساعد Larache AI. يمكنني مساعدتك في خدمات تطوير المواقع، الاستضافة، الدومينات، SSL، WordPress، Blogger وSEO. كيف يمكنني مساعدتك؟", false);
    }

    private void sendMessage() {
        String message = messageInput.getText().toString().trim();
        if (TextUtils.isEmpty(message)) return;

        addMessage(message, true);
        messageInput.setText("");
        sendButton.setEnabled(false);

        executor.execute(() -> {
            String reply = TextUtils.isEmpty(AI_ENDPOINT) ? localAssistant(message) : requestAI(message);
            runOnUiThread(() -> {
                addMessage(reply, false);
                sendButton.setEnabled(true);
            });
        });
    }

    private String localAssistant(String message) {
        String q = message.toLowerCase();
        if (containsAny(q, "seo", "سيو", "محركات", "search"))
            return "نقدم SEO تقني ومحتوى: تحسين العناوين والوصف، البيانات المنظمة، السرعة، الروابط الداخلية وتحليل الزيارات. إذا أرسلت رابط موقعك يمكن لفريق الدعم تحديد المطلوب";
        if (containsAny(q, "wordpress", "ووردبريس", "woocommerce"))
            return "يمكننا إنشاء وتخصيص ونقل WordPress وWooCommerce وتحسين الأداء والإضافات والتهيئة التقنية";
        if (containsAny(q, "blogger", "blogspot", "بلوجر"))
            return "ندعم Blogger/Blogspot: تخصيص القالب، ربط الدومين، الصفحات، بنية المقالات وSEO";
        if (containsAny(q, "domain", "دومين", "نطاق", "dns"))
            return "نساعدك في اختيار وربط وإدارة الدومين وسجلات DNS الأساسية وربطه بالاستضافة";
        if (containsAny(q, "hosting", "استضافة", "سيرفر", "vps", "cpanel"))
            return "نساعدك في اختيار وتهيئة الاستضافة، cPanel أو VPS، ونقل الموقع والنسخ الاحتياطي والبريد";
        if (containsAny(q, "ssl", "https", "شهادة", "أمان", "security"))
            return "يمكننا تهيئة SSL/TLS وHTTPS وإعادة التوجيه ومراجعة أساسيات الحماية والنسخ الاحتياطي";
        if (containsAny(q, "price", "pricing", "سعر", "ثمن", "تكلفة"))
            return "الأسعار تعتمد على نطاق المشروع والمزايا المطلوبة. اضغط على WhatsApp من الموقع لإرسال تفاصيل مشروعك والحصول على عرض مناسب";
        return "أستطيع مساعدتك في تطوير المواقع، المتاجر، الاستضافة، الدومينات، SSL، WordPress، Blogger وSEO. اكتب مثلاً: أريد موقعاً، أريد تحسين SEO، أو لدي مشكلة في الاستضافة";
    }

    private boolean containsAny(String text, String... values) {
        for (String value : values) if (text.contains(value)) return true;
        return false;
    }

    private String requestAI(String message) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(AI_ENDPOINT);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            connection.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("message", message);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = connection.getResponseCode();
            InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
            if (stream == null) return "تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً. حاول مرة أخرى";

            StringBuilder response = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
            }
            JSONObject json = new JSONObject(response.toString());
            return json.optString("reply", json.optString("message", "وصلتني رسالتك، لكن لم يصل رد صالح من خادم الذكاء الاصطناعي."));
        } catch (Exception e) {
            return "تعذر الوصول إلى خادم الذكاء الاصطناعي. المساعد المحلي ما زال متاحاً للأسئلة الشائعة";
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void addMessage(String text, boolean user) {
        TextView bubble = new TextView(this);
        bubble.setText(text);
        bubble.setTextSize(16);
        bubble.setTextColor(user ? Color.WHITE : Color.rgb(15, 23, 42));
        bubble.setGravity(Gravity.RIGHT);
        bubble.setPadding(18, 14, 18, 14);
        bubble.setBackgroundColor(user ? Color.rgb(15, 23, 42) : Color.rgb(226, 232, 240));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.82f),
                LinearLayout.LayoutParams.WRAP_CONTENT);
        params.gravity = user ? Gravity.START : Gravity.END;
        params.setMargins(0, 0, 0, 12);
        chatContainer.addView(bubble, params);
        chatScroll.post(() -> chatScroll.fullScroll(View.FOCUS_DOWN));
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
