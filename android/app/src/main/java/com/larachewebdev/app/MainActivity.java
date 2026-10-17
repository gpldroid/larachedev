package com.larachewebdev.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://gpldroid.github.io/larachedev/";
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(true);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new SupportBridge(), "LaracheSupport");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectSupportButton(view);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), 1001);
                    return true;
                } catch (ActivityNotFoundException e) {
                    uploadCallback = null;
                    return false;
                }
            }
        });

        if (savedInstanceState == null) webView.loadUrl(HOME_URL);
        else webView.restoreState(savedInstanceState);
    }

    private void injectSupportButton(WebView view) {
        String js = "javascript:(function(){if(document.getElementById('native-ai-support'))return;" +
                "var b=document.createElement('button');b.id='native-ai-support';b.type='button';" +
                "b.textContent='🤖 مساعد AI';b.setAttribute('aria-label','فتح مساعد الذكاء الاصطناعي');" +
                "b.style.cssText='position:fixed;bottom:20px;left:20px;z-index:2147483647;border:0;border-radius:999px;padding:13px 18px;background:#0b1220;color:#fff;font:700 14px sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22);cursor:pointer';" +
                "b.onclick=function(){LaracheSupport.openSupport()};document.body.appendChild(b)})()";
        view.evaluateJavascript(js, null);
    }

    private boolean handleUrl(String url) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if ("https".equalsIgnoreCase(scheme) && "gpldroid.github.io".equalsIgnoreCase(host)) return false;

        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)
                || "tel".equalsIgnoreCase(scheme) || "mailto".equalsIgnoreCase(scheme)
                || "whatsapp".equalsIgnoreCase(scheme)) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException ignored) { }
            return true;
        }
        return false;
    }

    private class SupportBridge {
        @JavascriptInterface
        public void openSupport() {
            runOnUiThread(() -> startActivity(new Intent(MainActivity.this, SupportActivity.class)));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1001 && uploadCallback != null) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            uploadCallback.onReceiveValue(results);
            uploadCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
