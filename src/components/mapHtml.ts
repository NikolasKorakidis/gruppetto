// Builds a self-contained MapLibre page. Rendered in a WebView on iOS/Android
// and in an <iframe srcdoc> on the web, so all three platforms share one map.
// Tiles: OpenFreeMap (free, no API key, no usage limits; OSM data).
export type MapInput = {
  line?: [number, number][] | null;
  start?: [number, number] | null;
  interactive?: boolean;
  dark?: boolean;
  color?: string;
  /** Extra space (px) kept clear when fitting the route, e.g. under floating UI. */
  padding?: { top: number; bottom: number; left: number; right: number };
};

const MAPLIBRE = 'https://unpkg.com/maplibre-gl@5.6.0/dist';

export function buildMapHtml({ line, start, interactive = false, dark = false, color = '#0E7C66', padding }: MapInput) {
  const pad = JSON.stringify(padding ?? { top: 24, bottom: 24, left: 24, right: 24 });
  const style = `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;
  // GeoJSON wants [lng, lat].
  const coords = (line ?? []).map(([lat, lng]) => [lng, lat]);
  const data = JSON.stringify({ coords, start: start ? [start[1], start[0]] : null });
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css">
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<style>html,body,#m{margin:0;padding:0;height:100%;width:100%;background:${dark ? '#1b1f22' : '#eceae4'}}
.credit{position:absolute;right:4px;bottom:3px;font:9px/1.2 -apple-system,system-ui,sans-serif;color:${dark ? '#aaa' : '#555'};background:${dark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.7)'};padding:1px 4px;border-radius:4px;pointer-events:none}</style></head>
<body><div id="m"></div><div class="credit">&copy; OpenFreeMap &copy; OpenStreetMap</div><script>
var d=${data};
var opts={container:'m',style:'${style}',interactive:${interactive ? 'true' : 'false'},attributionControl:false,fadeDuration:0};
if(d.coords.length>1){
  var b=d.coords.reduce(function(a,c){return[[Math.min(a[0][0],c[0]),Math.min(a[0][1],c[1])],[Math.max(a[1][0],c[0]),Math.max(a[1][1],c[1])]]},[[180,90],[-180,-90]]);
  opts.bounds=b;opts.fitBoundsOptions={padding:${pad}};
}else if(d.start){opts.center=d.start;opts.zoom=13;}
else{opts.center=[5.5,52.2];opts.zoom=6;}
var map=new maplibregl.Map(opts);
if(${interactive ? 'true' : 'false'})map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
map.on('load',function(){
  if(d.coords.length>1){
    map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:d.coords}}});
    map.addLayer({id:'casing',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffffff','line-width':8,'line-opacity':0.9}});
    map.addLayer({id:'line',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'${color}','line-width':4.5}});
    map.addSource('ends',{type:'geojson',data:{type:'FeatureCollection',features:[
      {type:'Feature',properties:{c:'#15181B'},geometry:{type:'Point',coordinates:d.coords[d.coords.length-1]}},
      {type:'Feature',properties:{c:'#22C55E'},geometry:{type:'Point',coordinates:d.coords[0]}}]}});
    map.addLayer({id:'ends',type:'circle',source:'ends',paint:{'circle-radius':6,'circle-color':['get','c'],'circle-stroke-color':'#fff','circle-stroke-width':3}});
  }else if(d.start){
    map.addSource('start',{type:'geojson',data:{type:'Feature',geometry:{type:'Point',coordinates:d.start}}});
    map.addLayer({id:'start',type:'circle',source:'start',paint:{'circle-radius':8,'circle-color':'${color}','circle-stroke-color':'#fff','circle-stroke-width':3}});
  }
});
</script></body></html>`;
}
