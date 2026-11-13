// Keisha's World — word data
// Source: Bahasa Cina SJKC Tahun 1 textbook, 认读生字与习写生字表 (p.153), units 识字一 to 第十单元.
// Function words (了 的 着 吗 们 …) are left out of the guessing game because they have no picture-able meaning.
// Format: "汉字|pinyin|English"
window.WORLDS = [
  { id: 1, name: "World 1 · Standard 1", islands: [
    { zh: "识字一", en: "Words I See", w: "蓝|lán|blue;天|tiān|sky;太阳|tài yáng|sun;小|xiǎo|small;鸟|niǎo|bird;上|shàng|up / on top;学|xué|learn;读|dú|read;书|shū|book;写|xiě|write;字|zì|word / character" },
    { zh: "上学了", en: "Off to School", w: "花|huā|flower;跟|gēn|follow / with;我|wǒ|I / me;招手|zhāo shǒu|wave hello;手|shǒu|hand;一|yī|one;起|qǐ|get up;走|zǒu|walk;到|dào|arrive;校|xiào|school;门|mén|door / gate;口|kǒu|mouth" },
    { zh: "早操", en: "Morning Exercise", w: "早|zǎo|early / morning;跳|tiào|jump;来|lái|come;去|qù|go;在|zài|at / in;树|shù|tree;枝|zhī|branch;做|zuò|do / make;操|cāo|exercise;朋友|péng you|friend;跑|pǎo|run;草|cǎo|grass;地|dì|ground" },
    { zh: "识字读书", en: "Learning to Read", w: "课|kè|lesson / class;识|shí|recognise;会|huì|can / able to;儿|ér|child;歌|gē|song;故事|gù shi|story;事|shì|thing / matter;习|xí|practise;长|zhǎng|grow;知|zhī|know" },
    { zh: "笔画", en: "Pen Strokes", w: "笔|bǐ|pen;画|huà|draw / picture;要|yào|want;好|hǎo|good;眼|yǎn|eye;心|xīn|heart;也|yě|also / too;顺|shùn|smooth / in order;错|cuò|wrong / mistake;不|bù|not / no" },
    { zh: "我的家", en: "My Family", w: "开|kāi|open;爸|bà|dad;妈|mā|mum;笑|xiào|laugh / smile;回|huí|go back;哥|gē|big brother;姐|jiě|big sister;全|quán|whole / all;家|jiā|home / family;声|shēng|sound / voice" },
    { zh: "星星", en: "Stars", w: "星|xīng|star;那|nà|that;多|duō|many;这|zhè|this;中|zhōng|middle;间|jiān|room / between;是|shì|is / am / are;三|sān|three;靠|kào|lean on;样|yàng|look / kind;近|jìn|near;亲|qīn|dear / relative;明|míng|bright" },
    { zh: "吃晚饭", en: "Dinner Time", w: "吃|chī|eat;晚|wǎn|evening / late;饭|fàn|rice / meal;有|yǒu|have;瓜|guā|melon;鱼|yú|fish;还|hái|still / also;蛋|dàn|egg;桌|zhuō|table;菜|cài|vegetable / dish;可|kě|can / may;大|dà|big;都|dōu|all;喜欢|xǐ huan|like" },
    { zh: "搭积木", en: "Building Blocks", w: "妹|mèi|little sister;搭|dā|build / put up;积木|jī mù|toy blocks;木|mù|wood;房|fáng|house;子|zǐ|child;机|jī|machine;场|chǎng|place / field;配|pèi|match;说|shuō|say / speak;城|chéng|city / town;市|shì|market / city;和|hé|and;游|yóu|swim / travel;乐|lè|happy / fun" },
    { zh: "识字二", en: "Nature Words", w: "双|shuāng|pair;林|lín|woods;片|piàn|slice / piece;森林|sēn lín|forest;绿|lǜ|green;羊|yáng|sheep / goat;美|měi|beautiful;肥|féi|fat (animal);丽|lì|pretty;舌|shé|tongue;甜|tián|sweet;爱|ài|love;蜂|fēng|bee;蜜|mì|honey" },
    { zh: "露珠", en: "Dewdrops", w: "露|lù|dew;珠|zhū|pearl / bead;照|zhào|shine on;张|zhāng|open (eyes / mouth);又|yòu|again;月|yuè|moon;亮|liàng|bright / shiny;出|chū|go out;红|hóng|red;见|jiàn|see / meet" },
    { zh: "雨停了", en: "After the Rain", w: "雨|yǔ|rain;停|tíng|stop;更|gèng|even more;山|shān|mountain;青|qīng|blue-green;弯|wān|bent / curved;曲|qū|winding;河|hé|river;胖|pàng|chubby" },
    { zh: "数一数", en: "Let's Count", w: "老|lǎo|old;老虎|lǎo hǔ|tiger;猫|māo|cat;边|biān|side;少|shǎo|few / little;群|qún|group / flock;鹅|é|goose;数|shǔ|count;瞧|qiáo|look / peek;记|jì|remember;牢|láo|firmly" },
    { zh: "小蚂蚁", en: "Little Ants", w: "蚂蚁|mǎ yǐ|ant;搬|bān|move / carry;虫|chóng|bug / insect;动|dòng|move;两|liǎng|two;点|diǎn|dot / a bit;重|zhòng|heavy;四|sì|four;五|wǔ|five;六|liù|six;七|qī|seven;进|jìn|go in;洞|dòng|hole / cave" },
    { zh: "我的身体", en: "My Body", w: "眼睛|yǎn jing|eyes;脚|jiǎo|foot;爪|zhǎo|claw;腿|tuǐ|leg;短|duǎn|short;牙|yá|tooth;牙齿|yá chǐ|teeth;睡觉|shuì jiào|go to sleep" },
    { zh: "小蜜蜂", en: "Busy Bees", w: "你|nǐ|you;就|jiù|right away;飞|fēi|fly;园|yuán|garden / park;嗅|xiù|sniff;香|xiāng|fragrant;味|wèi|taste / flavour;采|cǎi|pick / gather;造|zào|make / build;时|shí|time;流|liú|flow;汗|hàn|sweat;水|shuǐ|water" },
    { zh: "去玩吧", en: "Playground", w: "香蕉|xiāng jiāo|banana;黄|huáng|yellow;像|xiàng|look like;滑梯|huá tī|slide (playground);滑|huá|slippery;玩|wán|play;爬|pá|climb;下|xià|down;坐|zuò|sit;快|kuài|fast" },
    { zh: "唱歌", en: "Sing Along", w: "唱|chàng|sing;里|lǐ|inside;很|hěn|very;每|měi|every;从|cóng|from;响|xiǎng|loud / ring;落|luò|fall / drop;风|fēng|wind;听|tīng|listen;座|zuò|seat" },
    { zh: "识字三", en: "Feelings", w: "对|duì|correct;晴|qíng|sunny;伤|shāng|hurt;吵|chǎo|noisy / quarrel;闹|nào|make a fuss;安|ān|calm / safe;静|jìng|quiet;怕|pà|afraid;空|kōng|empty / sky;放|fàng|put / let go;情|qíng|feeling" },
    { zh: "夜晚", en: "Night Time", w: "夜|yè|night;悄悄|qiāo qiāo|quietly;换|huàn|change / swap;黑|hēi|black / dark;色|sè|colour;衣|yī|clothes;最|zuì|most;留|liú|stay / keep" },
    { zh: "画画", en: "Let's Draw", w: "用|yòng|use;铅笔|qiān bǐ|pencil;发现|fā xiàn|discover;慢|màn|slow;白|bái|white;文|wén|writing / language;图|tú|picture / map;本|běn|notebook" },
    { zh: "沙滩", en: "At the Beach", w: "金|jīn|gold;沙|shā|sand;沙滩|shā tān|beach;银|yín|silver;船|chuán|boat;工具|gōng jù|tools;简单|jiǎn dān|simple;板|bǎn|board;看|kàn|look at / watch;身|shēn|body;后|hòu|back / after;串|chuàn|string of beads" },
    { zh: "剪纸", en: "Paper Cutting", w: "公|gōng|public;轻|qīng|light (not heavy);吹|chuī|blow;叶|yè|leaf;飘|piāo|float / flutter;头|tóu|head;带|dài|bring / carry;拿|ná|take / hold;剪|jiǎn|cut (scissors);刀|dāo|knife;贴|tiē|stick / paste;纸|zhǐ|paper" }
  ]}
];

// Power Check (placement / monthly checkpoint): 12 characters sampled from each year's textbook character table.
// Standard 2–4 come from the 认读生字与习写生字表 at the back of each Tahun 2, 3 and 4 Bahasa Cina textbook.
window.POWER = {
  1: "花|huā|flower;鸟|niǎo|bird;树|shù|tree;吃|chī|eat;鱼|yú|fish;家|jiā|home / family;雨|yǔ|rain;猫|māo|cat;脚|jiǎo|foot;飞|fēi|fly;船|chuán|boat;纸|zhǐ|paper",
  2: "邮|yóu|post / mail;糖|táng|sugar / sweets;浪|làng|wave (sea);午|wǔ|noon;瓶|píng|bottle;汤|tāng|soup;竹|zhú|bamboo;龙|lóng|dragon;猪|zhū|pig;雾|wù|fog;绳|shéng|rope;碗|wǎn|bowl",
  3: "梅|méi|plum blossom;橙|chéng|orange (fruit);肩|jiān|shoulder;驴|lǘ|donkey;针|zhēn|needle;兵|bīng|soldier;燕|yàn|swallow (bird);帆|fān|sail;袖|xiù|sleeve;锅|guō|wok / pot;勺|sháo|spoon;箭|jiàn|arrow",
  4: "摘|zhāi|pick (fruit);狐|hú|fox;岩|yán|rock;琴|qín|piano;塔|tǎ|tower;溪|xī|stream;腹|fù|belly;剑|jiàn|sword;荔|lì|lychee;铜|tóng|copper;尘|chén|dust;芋|yù|taro"
};

window.parseWords = function (s) {
  return s.split(";").map(function (x) { var p = x.split("|"); return { zh: p[0], py: p[1], en: p[2] }; });
};
