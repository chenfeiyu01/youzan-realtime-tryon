const asset = file => import.meta.env.BASE_URL + 'garments/' + file;
const official = file => `https://cdn.22duck.cn/images/playground/clothx/${file}?v=32&presetVersion=20261030`;
const topPrompt = '将参考图的上衣穿到视频人物身上，其他保持不变';
const bottomPrompt = '将参考图的下装穿到视频人物身上，其他保持不变';
export const categories = [ ['tops', '上衣'], ['bottoms', '裤装'], ['outfits', '套装'], ['shoes', '鞋履'] ];
export const wardrobe = [
  { id: 'top-1', category: 'tops', name: '上衣 · 01', detail: 'Xmax 官方参考款', image: asset('clothx_image6.jpg'), remote: official('clothx_image6.png'), prompt: topPrompt },
  { id: 'top-2', category: 'tops', name: '上衣 · 02', detail: 'Xmax 官方参考款', image: asset('clothx_image7.jpg'), remote: official('clothx_image7.png'), prompt: topPrompt },
  { id: 'bottom-1', category: 'bottoms', name: '裤装 · 01', detail: 'Xmax 官方参考款', image: asset('clothx_image8.jpg'), remote: official('clothx_image8.png'), prompt: bottomPrompt },
  { id: 'bottom-2', category: 'bottoms', name: '裤装 · 02', detail: 'Xmax 官方参考款', image: asset('clothx_real_image9.jpg'), remote: official('clothx_real_image9.png'), prompt: bottomPrompt },
  { id: 'outfit-1', category: 'outfits', name: '粉色学院装', detail: 'Xmax 官方参考款', image: asset('clothx_image1.jpg'), remote: official('clothx_image1.png'), prompt: '视频中人物衣服替换成参考图中衣服' },
  { id: 'outfit-2', category: 'outfits', name: '棕色文艺装', detail: 'Xmax 官方参考款', image: asset('clothx_real_image4.jpg'), remote: official('clothx_real_image4.png'), prompt: '视频中人物衣服替换成参考图中衣服' },
  { id: 'shoe-1', category: 'shoes', name: '红黑高帮鞋', detail: '商品参考图', image: asset('shoes-1.webp'), prompt: '将参考图中的鞋子穿到视频人物双脚上，保持人物原来的上衣、裤装、脸部和背景不变' },
  { id: 'shoe-2', category: 'shoes', name: '运动训练鞋', detail: '商品参考图', image: asset('shoes-2.webp'), prompt: '将参考图中的鞋子穿到视频人物双脚上，保持人物原来的上衣、裤装、脸部和背景不变' },
];
export const categoryPrompts = { tops: topPrompt, bottoms: bottomPrompt,
  outfits: '视频中人物衣服替换成参考图中衣服',
  shoes: '将参考图中的鞋子穿到视频人物双脚上，保持其他服装、脸部和背景不变' };
