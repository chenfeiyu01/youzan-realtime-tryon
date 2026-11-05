const asset = file => import.meta.env.BASE_URL + 'garments/' + file;
const official = file => `https://cdn.22duck.cn/images/playground/clothx/${file}?v=32&presetVersion=20261030`;
const topPrompt = '将参考图的上衣穿到视频人物身上，其他保持不变';
const bottomPrompt = '将参考图的下装穿到视频人物身上，其他保持不变';
export const categories = [ ['tops', '上衣'], ['bottoms', '裤装'], ['outfits', '套装'], ['shoes', '鞋履'] ];
export const wardrobe = [
  { id: "quiet-wrap-blazer", category: "tops", name: "灰褐不对称西装", image: asset("quiet-wrap-blazer.webp"), prompt: "将参考图中的灰褐色羊毛西装，非对称交叠门襟、宽翻领、单粒深色纽扣穿到视频人物身上，准确保留服饰的低饱和颜色与剪裁，保持人物身份、姿态、其他衣物及背景不变", decartPrompt: "Substitute the current top with the reference mushroom-taupe wool wrap blazer, asymmetric overlapping front and sculptural lapel. Preserve its tailoring, the person's identity and background." },
  { id: "quiet-cropped-jacket", category: "tops", name: "燕麦短款夹克", image: asset("quiet-cropped-jacket.webp"), prompt: "将参考图中的燕麦色无领短夹克，圆弧袖型、落肩、曲线贴袋穿到视频人物身上，准确保留服饰的低饱和颜色与剪裁，保持人物身份、姿态、其他衣物及背景不变", decartPrompt: "Substitute the current top with the reference oatmeal collarless cropped wool jacket, rounded sleeves and curved patch pockets. Preserve its proportions, the person's identity and background." },
  { id: "quiet-draped-knit", category: "tops", name: "炭灰斜领针织", image: asset("quiet-draped-knit.webp"), prompt: "将参考图中的炭灰色长袖针织衫，宽幅非对称折叠斜领、垂褶穿到视频人物身上，准确保留服饰的低饱和颜色与剪裁，保持人物身份、姿态、其他衣物及背景不变", decartPrompt: "Substitute the current top with the reference charcoal fine-knit top, broad asymmetrical folded neckline and sculptural draping. Preserve its silhouette, the person's identity and background." },
  { id: "quiet-sage-shirt", category: "tops", name: "雾绿褶裥衬衫", image: asset("quiet-sage-shirt.webp"), prompt: "将参考图中的低饱和灰鼠尾草绿长袖衬衫，立领、隐形门襟、直线刀褶穿到视频人物身上，准确保留服饰的低饱和颜色与剪裁，保持人物身份、姿态、其他衣物及背景不变", decartPrompt: "Substitute the current top with the reference desaturated grey-sage cotton shirt, stand collar, concealed placket and precise front pleats. Preserve the person's identity and background." },
  { id: 'collection-3', category: 'tops', name: '棉质夹克', image: asset('collection-3.jpg'), prompt: topPrompt },
  { id: 'collection-16', category: 'tops', name: '机车皮衣', image: asset('collection-16.jpg'), prompt: topPrompt },
  { id: 'top-1', category: 'tops', name: '上衣 · 01', detail: 'Xmax 官方参考款', image: asset('clothx_image6.jpg'), remote: official('clothx_image6.png'), prompt: topPrompt },
  { id: 'top-2', category: 'tops', name: '上衣 · 02', detail: 'Xmax 官方参考款', image: asset('clothx_image7.jpg'), remote: official('clothx_image7.png'), prompt: topPrompt },
  { id: "quiet-pleated-trousers", category: "bottoms", name: "石灰褶裥阔腿裤", image: asset("quiet-pleated-trousers.webp"), prompt: "将参考图中的石灰褐色高腰阔腿西裤，深褶、延伸腰头、长直阔腿穿到视频人物身上，准确保留服饰的低饱和颜色与剪裁，保持人物身份、姿态、其他衣物及背景不变", decartPrompt: "Substitute the current bottoms with the reference stone-taupe high-waisted tailored wide-leg trousers, deep forward pleats and extended waistband. Preserve the person's top, identity and background." },
  { id: 'bottom-1', category: 'bottoms', name: '裤装 · 01', detail: 'Xmax 官方参考款', image: asset('clothx_image8.jpg'), remote: official('clothx_image8.png'), prompt: bottomPrompt },
  { id: 'bottom-2', category: 'bottoms', name: '裤装 · 02', detail: 'Xmax 官方参考款', image: asset('clothx_real_image9.jpg'), remote: official('clothx_real_image9.png'), prompt: bottomPrompt },
  { id: "quiet-waistcoat-set", category: "outfits", name: "烟灰马甲套装", image: asset("quiet-waistcoat-set.webp"), prompt: "将参考图中的暖烟灰色长款V领马甲、非对称尖角下摆，搭配同色高腰阔腿裤穿到视频人物身上，准确保留服饰的低饱和颜色与剪裁，保持人物身份、姿态、其他衣物及背景不变", decartPrompt: "Substitute the current outfit with the reference warm-charcoal longline V-neck waistcoat and matching wide-leg pleated trousers. Preserve their tailoring, the person's identity and background." },
  { id: 'collection-181', category: 'outfits', name: '红黑套装', image: asset('collection-181.jpg'), prompt: '视频中人物衣服替换成参考图中衣服' },
  { id: 'outfit-1', category: 'outfits', name: '粉色学院装', detail: 'Xmax 官方参考款', image: asset('clothx_image1.jpg'), remote: official('clothx_image1.png'), prompt: '视频中人物衣服替换成参考图中衣服' },
  { id: 'outfit-2', category: 'outfits', name: '棕色文艺装', detail: 'Xmax 官方参考款', image: asset('clothx_real_image4.jpg'), remote: official('clothx_real_image4.png'), prompt: '视频中人物衣服替换成参考图中衣服' },
  { id: 'shoe-1', category: 'shoes', name: '红黑高帮鞋', detail: '商品参考图', image: asset('shoes-1.webp'), prompt: '将参考图中的鞋子穿到视频人物双脚上，保持人物原来的上衣、裤装、脸部和背景不变' },
  { id: 'shoe-2', category: 'shoes', name: '运动训练鞋', detail: '商品参考图', image: asset('shoes-2.webp'), prompt: '将参考图中的鞋子穿到视频人物双脚上，保持人物原来的上衣、裤装、脸部和背景不变' },
  { id: 'collection-185', category: 'shoes', name: '黑棕便鞋', image: asset('collection-185.jpg'), prompt: '将参考图中的鞋子穿到视频人物双脚上，保持人物原来的上衣、裤装、脸部和背景不变' },
  { id: 'collection-186', category: 'shoes', name: '经典高跟鞋', image: asset('collection-186.jpg'), prompt: '将参考图中的鞋子穿到视频人物双脚上，保持人物原来的上衣、裤装、脸部和背景不变' },
];
export const categoryPrompts = { tops: topPrompt, bottoms: bottomPrompt,
  outfits: '视频中人物衣服替换成参考图中衣服',
  shoes: '将参考图中的鞋子穿到视频人物双脚上，保持其他服装、脸部和背景不变' };
