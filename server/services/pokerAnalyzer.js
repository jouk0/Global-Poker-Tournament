
module.exports = {
  analyzeByPosition(hands) {
    const grouped = {};
  
    for (const h of hands) {
      grouped[h.position] ??= { total: 0, vpip: 0, pfr: 0 };
      grouped[h.position].total++;
      if (h.vpip) grouped[h.position].vpip++;
      if (h.pfr) grouped[h.position].pfr++;
    }
  
    for (const pos in grouped) {
      grouped[pos].vpip = grouped[pos].vpip / grouped[pos].total * 100;
      grouped[pos].pfr  = grouped[pos].pfr  / grouped[pos].total * 100;
    }
  
    return grouped;
  },
  analyze(hands) {
    const total = hands.length;
    const winrate = hands.reduce((s,h)=>s+h.resultBB,0)/(total||1);
    const vpip = total ? hands.filter(h => h.vpip).length / total * 100 : 0;
    const pfr  = total ? hands.filter(h => h.pfr ).length / total * 100 : 0;
    return { totalHands: total, winrateBB100: winrate*100, vpip, pfr };
  }
};
