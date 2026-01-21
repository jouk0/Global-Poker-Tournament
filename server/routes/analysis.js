
const express = require('express');
const Hand = require('../models/Hand');
const analyzer = require('../services/pokerAnalyzer');
const router = express.Router();

router.post('/decision', async (req, res) => {
  const { heroCards, equity, action } = req.body;

  await Hand.create({
    handId: crypto.randomUUID(),
    heroCards,
    position: req.body.position,
    resultBB: req.body.resultBB ?? 0,
    vpip: action !== 'fold',
    pfr: action === 'raise'
  });

  res.json({ saved: true });
});

router.get('/by-position', async (req, res) => {
  const hands = await Hand.findAll();
  res.json(analyzer.analyzeByPosition(hands));
});

router.get('/hands', async (req, res) => {
  const where = {};
  if (req.query.position) {
    where.position = req.query.position;
  }

  const hands = await Hand.findAll({ where });
  res.json(hands);
});


router.delete('/hand/:id', async (req, res) => {
  await Hand.destroy({ where: { id: req.params.id } });
  res.json({ deleted: true });
});

router.put('/hand/:id', async (req, res) => {
  const hand = await Hand.findByPk(req.params.id);
  if (!hand) return res.status(404).end();

  await hand.update(req.body);
  res.json(hand);
});

router.post('/hand', async (req, res) => {
  const {
    handId,
    heroCards,
    position,
    resultBB,
    vpip,
    pfr
  } = req.body;

  const hand = await Hand.create({
    handId,
    heroCards,
    position,
    resultBB,
    vpip,
    pfr
  });

  res.json(hand);
});

router.get('/seed', async (req, res) => {
  await Hand.bulkCreate([
    {
      handId: 'H1',
      heroCards: 'Ah Kh',
      position: 'BTN',
      resultBB: 2.5,
      vpip: true,
      pfr: true
    },
    {
      handId: 'H2',
      heroCards: '7c 7d',
      position: 'BB',
      resultBB: -1,
      vpip: true,
      pfr: false
    },
    {
      handId: 'H3',
      heroCards: 'Qs Js',
      position: 'CO',
      resultBB: 4.2,
      vpip: true,
      pfr: true
    }
  ]);

  res.json({ status: 'ok', inserted: 3 });
});
router.get('/summary', async (req,res)=>{
  const hands = await Hand.findAll();
  res.json(analyzer.analyze(hands));
});

module.exports = router;
