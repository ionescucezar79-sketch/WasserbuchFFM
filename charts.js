// charts.js — dynamic meters support
const COLORS = ['#185FA5','#3B6D11','#A32D2D','#7B4FA6','#C27A1A','#C2671A','#1AA5A5','#A51A85'];
let lineChart=null, barChart=null;

const isDark  = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const gridClr = () => isDark() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
const tickClr = () => isDark() ? '#9a9991' : '#6b6a65';
const bgClr   = () => isDark() ? '#1e1d1a' : '#ffffff';

export function renderLineChart(entries, activeKeys, meters) {
  const ctx = document.getElementById('chart-line');
  if (!ctx) return;
  const sorted = [...entries].sort((a,b) => a.ts-b.ts);
  const labels = sorted.map(e => e.datum);
  const datasets = activeKeys.map((key, i) => {
    const m = meters.find(x => x.key===key);
    return {
      label: m?.label || key,
      data:  sorted.map(e => {
        const v = e.readings?.[key];
        return v!==''&&v!=null ? Number(v) : null;
      }),
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length]+'22',
      tension:.3, pointRadius:4, pointHoverRadius:6,
      fill:false, spanGaps:true
    };
  });
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type:'line', data:{labels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:tickClr(),font:{family:"'IBM Plex Mono',monospace",size:11}}},
        tooltip:{backgroundColor:bgClr(),titleColor:tickClr(),bodyColor:tickClr(),borderColor:gridClr(),borderWidth:1}
      },
      scales:{
        x:{ticks:{color:tickClr(),font:{size:10}},grid:{color:gridClr()}},
        y:{ticks:{color:tickClr(),font:{family:"'IBM Plex Mono',monospace",size:10}},grid:{color:gridClr()}}
      }
    }
  });
}

export function renderBarChart(entries, activeKeys, meters) {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;
  const sorted = [...entries].sort((a,b) => a.ts-b.ts);
  const months = {};
  for (let i=1; i<sorted.length; i++) {
    const e=sorted[i], p=sorted[i-1];
    const parts=e.datum.split('.');
    if (parts.length<3) continue;
    const key=`${parts[1]}/${parts[2]}`;
    if (!months[key]) months[key]={};
    for (const k of activeKeys) {
      const ev=e.readings?.[k], pv=p.readings?.[k];
      if (ev!==''&&ev!=null&&pv!==''&&pv!=null)
        months[key][k]=(months[key][k]||0)+(Number(ev)-Number(pv));
    }
  }
  const mLabels=Object.keys(months);
  const datasets=activeKeys.map((key,i)=>{
    const m=meters.find(x=>x.key===key);
    return {
      label:m?.label||key,
      data:mLabels.map(ml=>months[ml][key]||0),
      backgroundColor:COLORS[i%COLORS.length]+'cc',
      borderColor:COLORS[i%COLORS.length],
      borderWidth:1, borderRadius:3
    };
  });
  if (barChart) barChart.destroy();
  barChart = new Chart(ctx, {
    type:'bar', data:{labels:mLabels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:tickClr(),font:{family:"'IBM Plex Mono',monospace",size:11}}},
        tooltip:{backgroundColor:bgClr(),titleColor:tickClr(),bodyColor:tickClr(),borderColor:gridClr(),borderWidth:1}
      },
      scales:{
        x:{ticks:{color:tickClr(),font:{size:10}},grid:{color:gridClr()}},
        y:{ticks:{color:tickClr(),font:{family:"'IBM Plex Mono',monospace",size:10}},grid:{color:gridClr()}}
      }
    }
  });
}
