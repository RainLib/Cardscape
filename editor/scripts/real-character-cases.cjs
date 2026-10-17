// Real artwork is intentionally referenced, not copied into the source tree.
// Pivots/probes below are in the original registered 1024 x 1536 artwork.
module.exports = [
  {
    id: 'quantumslinger', source: '27-quantumslinger-v2', name: '量子枪客',
    root: [550, 620],
    parts: [
      {bone:'near-arm',layer:'near-grip',pivot:[403,360],angle:4,connection:'人物右近臂 → 右肩甲；枪、手指、握点、护腕和袖臂整体运动',probes:[[258,329],[212,177]]},
      {bone:'far-arm',layer:'far-grip',pivot:[561,365],angle:-6,connection:'人物左远臂 → 左肩；小枪、左手、袖臂整体运动',probes:[[742,353],[838,311]]},
      {bone:'near-leg',layer:'near-leg',pivot:[603,679],angle:3,connection:'人物右近腿 → 腰髋；大膝与完整近靴保持刚性'},
      {bone:'far-leg',layer:'far-leg',pivot:[566,794],angle:-3,connection:'人物左远腿 → 后侧髋根；使用已有真实腿甲补绘'}
    ],
    hidden:['near-grip','near-leg','hero-body'],
    warning:'远侧袖臂仍有原始遮挡切口，旋转需要检查肩根支撑；衣摆仅继承主体并保留现有柔性根部。'
  },
  {
    id:'stormbreaker',source:'11-stormbreaker-v1',name:'风暴断峰',root:[625,615],
    parts:[
      {bone:'grip',layer:'near-grip',pivot:[524,449],angle:4,connection:'人物右臂、双手、两处握点、整把巨锤同一刚性组',probes:[[641,683],[690,756],[757,1097]]},
      {bone:'far-arm',layer:'far-upper-arm',pivot:[524,449],angle:4,connection:'人物左后上臂与双手握锤组同步，肘端同变换；肩端仍需观察真实支撑'},
      {bone:'near-leg',layer:'near-leg',pivot:[493,739],angle:2,connection:'人物右近腿 → 腰髋；腿甲、厚靴整体'},
      {bone:'far-leg',layer:'far-leg',pivot:[661,821],angle:-2,connection:'人物左远腿 → 后侧髋根；使用已有真实后腿补绘'}
    ],
    static:['rock-fragments'],hidden:['near-grip','near-leg','hero-body'],
    warning:'双手握锤形成闭链。当前按现有整体握持组同步左后上臂；独立肩肘的大幅攻击不在本次通过范围，必须检查两个上臂连接。'
  }
];
