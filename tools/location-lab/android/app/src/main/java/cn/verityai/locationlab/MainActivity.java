package cn.verityai.locationlab;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.net.wifi.*;
import android.os.*;
import android.webkit.*;
import android.view.View;
import org.json.*;
import java.util.*;

public class MainActivity extends Activity {
    private WebView web;
    private WifiManager wifi;
    private LocationManager location;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean pendingScan, gotLocation, gotGps, registered;
    private long requestStarted, lastScanRequest = -60000;
    private static final String PAGE = "file:///android_asset/index.html";
    private final Runnable scanTimeout = () -> { if (pendingScan) { pendingScan = false; wifiError("扫描超时，请稍后重试。"); } };
    private final Runnable locationTimeout = () -> { stopLocation(); if (!gotLocation) gpsError("30 秒内未获取定位，请开启系统定位或移到室外重试。"); };
    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location value) {
            if (SystemClock.elapsedRealtimeNanos() - value.getElapsedRealtimeNanos() > 30_000_000_000L) return;
            boolean gps = LocationManager.GPS_PROVIDER.equals(value.getProvider());
            if (gotGps && !gps) return;
            gotLocation = true; gotGps |= gps;
            try {
                JSONObject coords = new JSONObject().put("latitude",value.getLatitude()).put("longitude",value.getLongitude()).put("accuracy",value.getAccuracy());
                emit("onNativeLocation",new JSONObject().put("coords",coords).put("timestamp",value.getTime()).put("provider",gps?"GPS 卫星定位":"系统网络定位（等待 GPS）"));
            } catch (JSONException ignored) {}
        }
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
        @Override public void onStatusChanged(String provider,int status,Bundle extras) {}
    };
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c,Intent intent) {
            if (!WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(intent.getAction()) || !pendingScan) return;
            pendingScan = false; handler.removeCallbacks(scanTimeout);
            if (!intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED,false)) { wifiError("系统扫描失败或限频，请 30 秒后重试。"); return; }
            try {
                JSONArray aps = new JSONArray();
                List<ScanResult> results = new ArrayList<>(wifi.getScanResults());
                results.sort((a,b)->Integer.compare(b.level,a.level));
                long newest = 0;
                for (ScanResult r:results) {
                    long age = SystemClock.elapsedRealtime() - r.timestamp/1000;
                    if (r.timestamp/1000 < requestStarted - 2000 || age < 0 || age > 30000) continue;
                    newest = Math.max(newest,r.timestamp);
                    aps.put(new JSONObject().put("ssid",r.SSID).put("bssid",r.BSSID).put("rssi",r.level).put("frequency",r.frequency).put("ageMs",age));
                }
                String bssid = wifi.getConnectionInfo().getBSSID();
                if ("02:00:00:00:00:00".equals(bssid) || "00:00:00:00:00:00".equals(bssid)) bssid = null;
                emit("onNativeWifi",new JSONObject().put("fresh",aps.length()>0).put("aps",aps).put("scanId",Long.toString(newest)).put("connectedBssid",bssid==null?JSONObject.NULL:bssid).put("message",aps.length()>0?"扫描完成："+aps.length()+" 个 AP · "+new java.text.SimpleDateFormat("HH:mm:ss",Locale.CHINA).format(new Date()):"没有获取到新的 AP 数据，请确认 Wi-Fi 已开启。"));
                status("Wi-Fi 扫描完成；GPS 最多等待 30 秒。");
            } catch (Exception e) { wifiError("无法读取 Wi-Fi，请检查精确位置权限和系统定位开关。"); }
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        wifi = (WifiManager)getApplicationContext().getSystemService(WIFI_SERVICE);
        location = (LocationManager)getSystemService(LOCATION_SERVICE);
        web = new WebView(this); setContentView(web);
        web.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                String url=r.getUrl().toString();
                if(Arrays.asList(PAGE,"file:///android_asset/app.js","file:///android_asset/fingerprint.js","file:///android_asset/style.css").contains(url))return null;
                return new WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient(){@Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new android.app.AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("清空",(d,w)->result.confirm()).setNegativeButton("取消",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}});
        web.addJavascriptInterface(new Object(){@JavascriptInterface public void collect(){runOnUiThread(()->begin());}},"AndroidCollector");
        IntentFilter filter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(receiver,filter,Context.RECEIVER_EXPORTED);else registerReceiver(receiver,filter);
        registered = true; web.loadUrl(PAGE);
    }
    private void begin() {
        if(!PAGE.equals(web.getUrl()))return;
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED || (Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES)!=PackageManager.PERMISSION_GRANTED)){
            ArrayList<String> permissions=new ArrayList<>(Arrays.asList(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION));
            if(Build.VERSION.SDK_INT>=33)permissions.add(Manifest.permission.NEARBY_WIFI_DEVICES);
            requestPermissions(permissions.toArray(new String[0]),7);return;
        }
        stopLocation(); gotLocation=false; gotGps=false;
        boolean enabled=false;
        for(String provider:Arrays.asList(LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER)){
            try {if(location.isProviderEnabled(provider)){location.requestLocationUpdates(provider,1000,0,listener,Looper.getMainLooper());enabled=true;}}catch(Exception ignored){}
        }
        if(enabled)handler.postDelayed(locationTimeout,30000);else gpsError("系统定位未开启或设备不支持，请在设置中开启位置服务。");
        if(pendingScan){status("正在扫描，请等待本次结果。");return;}
        long now=SystemClock.elapsedRealtime();
        if(now-lastScanRequest<30000){wifiError("请等待 "+((30000-now+lastScanRequest+999)/1000)+" 秒后再次扫描，避免系统限频。");return;}
        try {
            if(wifi==null||!wifi.isWifiEnabled()){wifiError("请先开启 Wi-Fi。");return;}
            lastScanRequest=now;requestStarted=now;pendingScan=true;
            if(!wifi.startScan()){pendingScan=false;wifiError("系统拒绝扫描，请开启定位并等待 30 秒后重试。");return;}
            handler.postDelayed(scanTimeout,20000);status("正在获取 GPS 与 Wi-Fi，请稍候…");
        }catch(Exception e){pendingScan=false;wifiError("扫描权限不可用，请允许精确位置并开启系统定位。");}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);boolean all=grants.length>0;for(int grant:grants)all &= grant==PackageManager.PERMISSION_GRANTED;if(all)begin();else{status("需要精确位置和附近设备权限，请在应用设置中允许后重试。");gpsError("权限不足");wifiError("权限不足，无法读取 BSSID 与 AP 信号。");}}
    private void emit(String fn,JSONObject data){web.evaluateJavascript("window."+fn+"("+data.toString()+")",null);}
    private void status(String value){web.evaluateJavascript("window.onNativeStatus("+JSONObject.quote(value)+")",null);}
    private void gpsError(String value){try{emit("onNativeLocation",new JSONObject().put("error",value));}catch(JSONException ignored){}}
    private void wifiError(String value){try{emit("onNativeWifi",new JSONObject().put("fresh",false).put("aps",new JSONArray()).put("message",value));status(value);}catch(JSONException ignored){}}
    private void stopLocation(){handler.removeCallbacks(locationTimeout);try{location.removeUpdates(listener);}catch(Exception ignored){}}
    @Override protected void onStop(){super.onStop();stopLocation();pendingScan=false;handler.removeCallbacks(scanTimeout);if(web!=null){status("采集已停止；返回后请重新获取。");}}
    @Override protected void onDestroy(){if(registered)unregisterReceiver(receiver);handler.removeCallbacksAndMessages(null);web.removeJavascriptInterface("AndroidCollector");web.destroy();super.onDestroy();}
}
