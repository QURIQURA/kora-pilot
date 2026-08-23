CREATE OR REPLACE FUNCTION public.seed_default_ingredients(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ingredients (
    user_id, name, name_en, is_functional, reference_basis,
    typical_rate_min, typical_rate_max, bloom, scaling_mode, scaling_exponent,
    process_note, role_toughener, role_tenderizer, role_moistener, role_drier,
    comp_water, comp_fat, comp_protein, comp_sugar, comp_other_solids, comp_alcohol,
    fat_type, sugar_type, pac_value, pod_value, flavour_family_id, composition_source
  )
  SELECT p_user_id, v.name, v.name_en, v.isfunc, v.basis, v.rmin, v.rmax, v.bloom,
         v.smode, v.k, v.pnote, v.t, v.n, v.m, v.d,
         v.water, v.fat, v.protein, v.sugar, v.osol, v.alc,
         v.ftype, v.stype, v.pac, v.pod,
         CASE WHEN v.fam IS NULL THEN NULL
              ELSE (SELECT f.id FROM public.flavour_families f
                    WHERE f.user_id = p_user_id AND f.name = v.fam LIMIT 1) END,
         v.csrc
  FROM (VALUES
    -- A. 기능성 재료 (49)
    ('젤라틴','Gelatin',true,'liquid',1.5,3,200,'linear',1.0,'큰 배치는 냉각이 느려 더 단단해질 수 있음 — 냉각 조건 기록',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('한천','Agar-agar',true,'liquid',0.5,1.5,NULL,'linear',1.0,'85°C 이상 끓여야 활성화, 35~40°C에서 굳음',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('펙틴 NH','Pectin NH',true,'puree_sugar',1,1.5,NULL,'linear',1.0,'재가열 가능. 산·칼슘 필요',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('펙틴 옐로우','Pectin Jaune',true,'total',1,1.5,NULL,'linear',1.0,'파트드프뤼용. Brix 75 이상 + 주석산 필수',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('펙틴 X58','Pectin X58',true,'liquid',1,2,NULL,'linear',1.0,'유제품·저당 배합용. 칼슘 반응성',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('카파 카라기난','Kappa carrageenan',true,'liquid',0.3,1.5,NULL,'linear',1.0,'단단하고 부서지는 겔. 칼륨과 상승 작용',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('이오타 카라기난','Iota carrageenan',true,'liquid',0.3,1,NULL,'linear',1.0,'부드럽고 탄력. 요변성',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('젤란검 LT100','Gellan LT',true,'liquid',0.3,1,NULL,'linear',1.0,'투명·단단·내열성',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('젤란검 HT100','Gellan HT',true,'liquid',0.3,1,NULL,'linear',1.0,'부드럽고 탄력',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('메틸셀룰로스','Methylcellulose',true,'liquid',0.5,2,NULL,'linear',1.0,'뜨거우면 굳고 식으면 녹음. 찬물 분산 후 냉장 수화 필수',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('곤약검','Konjac gum',true,'liquid',0.2,1,NULL,'linear',1.0,'잔탄·카라기난과 섞으면 겔 강도 크게 상승',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('잔탄검','Xanthan gum',true,'liquid',0.1,0.5,NULL,'linear',1.0,'분산 주의 — 설탕과 미리 섞을 것. 과하면 미끈해짐',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('구아검','Guar gum',true,'liquid',0.1,0.5,NULL,'linear',1.0,'찬물에서 수화',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('로커스트빈검','Locust bean gum',true,'liquid',0.1,0.5,NULL,'linear',1.0,'카파·잔탄과 상승 작용',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('타라검','Tara gum',true,'liquid',0.1,0.5,NULL,'linear',1.0,'구아와 LBG의 중간 성질',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('람다 카라기난','Lambda carrageenan',true,'liquid',0.1,0.5,NULL,'linear',1.0,'굳지 않고 점도만',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('울트라텍스 3','Ultratex 3',true,'liquid',1,3,NULL,'linear',1.0,'가열 없이 즉시 증점',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('대두 레시틴','Soy lecithin',true,'fat',0.3,1,NULL,'linear',1.0,'에어 생성 시엔 액체 대비 0.3~0.6%',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('슈크로스 에스테르','Sucrose ester',true,'liquid',0.5,2,NULL,'linear',1.0,'수중유형 유화. 안정적인 에어',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('글리세린 플레이크','Glycerin flakes',true,'fat',0.5,2,NULL,'linear',1.0,'유중수형 유화',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('모노디글리세라이드','Mono & diglycerides',true,'fat',0.3,1,NULL,'linear',1.0,'조직 개선·노화 지연',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('폴리소르베이트 80','Polysorbate 80',true,'total',0.1,0.5,NULL,'linear',1.0,'아이스크림 오버런 향상',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('알부민 파우더','Albumin powder',true,'liquid',1,3,NULL,'linear',1.0,'건조 난백. 머랭 안정화',true,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('베르사휩','Versawhip',true,'liquid',0.3,1,NULL,'linear',1.0,'지방 없이 거품. 잔탄과 병용 시 안정',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('프로에스푸마 콜드','Proespuma Cold',true,'liquid',5,10,NULL,'linear',1.0,'상업 블렌드 — 패키지 권장량 우선',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('프로에스푸마 핫','Proespuma Hot',true,'liquid',5,10,NULL,'linear',1.0,'따뜻한 무스용 블렌드',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('알긴산나트륨','Sodium alginate',true,'liquid',0.5,1,NULL,'linear',1.0,'정방향은 재료에, 역방향은 침전조에 0.5%. pH 4 이상 필요',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('염화칼슘','Calcium chloride',true,'bath',0.5,1,NULL,'linear',1.0,'정방향 침전조용. 쓴맛 강함 — 반드시 헹굴 것',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('젖산칼슘','Calcium lactate',true,'bath',0.5,1,NULL,'linear',1.0,'염화칼슘보다 맛이 순함',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('젖산글루콘산칼슘','Calcium lactate gluconate',true,'liquid',1,2,NULL,'linear',1.0,'역방향용 — 재료 쪽에. 맛 영향 가장 적음',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('구연산나트륨','Sodium citrate',true,'liquid',0.2,1,NULL,'linear',1.0,'pH 완충. 치즈 유화에도 사용',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('베이킹파우더','Baking powder',true,'flour',1,3,NULL,'sub_linear',0.85,'1작은술 ≈ 4~5g',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('베이킹소다','Baking soda',true,'flour',0.5,1,NULL,'sub_linear',0.85,'산성 재료 필요. 파우더의 3~4배 강함',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('인스턴트 이스트','Instant dry yeast',true,'flour',0.5,1,NULL,'sub_linear',0.85,'저온 장시간 발효는 0.2~0.5%. 큰 반죽은 발효가 빨라짐',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('생이스트','Fresh yeast',true,'flour',1.5,3,NULL,'sub_linear',0.85,'인스턴트의 약 3배',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('암모늄 바이보네이트','Baker''s ammonia',true,'flour',0.5,1.5,NULL,'sub_linear',0.85,'얇고 바삭한 과자 전용. 수분 남으면 냄새',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('타르타르 크림','Cream of tartar',true,'egg_white',0.5,1,NULL,'sub_linear',0.85,'머랭 안정화',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('소금','Salt',true,'flour',0.5,2.2,NULL,'sub_linear',0.85,'빵 1.8~2.2%, 과자 0.5~1%. 글루텐 강화 + 발효 조절',true,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('구연산','Citric acid',true,'total',0.1,1,NULL,'sub_linear',0.85,'물에 1:1 용액으로 쓰면 계량 쉬움',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('주석산','Tartaric acid',true,'total',0.1,0.5,NULL,'sub_linear',0.85,'파트드프뤼의 표준 산',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('사과산','Malic acid',true,'total',0.1,0.5,NULL,'sub_linear',0.85,'산미가 오래 남음',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('소르비톨','Sorbitol',true,'total',1,5,NULL,'linear',1.0,'보습',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'sorbitol',190,60,NULL,NULL),
    ('트레할로스','Trehalose',true,'sugar',10,30,NULL,'linear',1.0,'단맛 약함',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'trehalose',100,45,NULL,NULL),
    ('글리세롤','Glycerol',true,'total',1,3,NULL,'linear',1.0,'슈거페이스트·마지팬 유연성',false,true,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('아이스크림 안정제','Ice cream stabiliser',true,'total',0.2,0.5,NULL,'linear',1.0,'블렌드 제품 — 제조사 스펙 우선',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('말토덱스트린','Tapioca maltodextrin',true,'fat',40,60,NULL,'linear',1.0,'지방을 가루로. 습기에 매우 약함',false,false,false,true,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,30,10,NULL,NULL),
    ('트랜스글루타미나제','Transglutaminase',true,'total',0.5,1,NULL,'linear',1.0,'40~55°C 활성, 가열로 실활',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('이산화규소','Silicon dioxide',true,'total',0.5,2,NULL,'linear',1.0,'고결 방지',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    ('바닐라 익스트랙','Vanilla extract',true,'total',0.5,2,NULL,'sub_linear',0.7,'강한 향 — 큰 배치에서는 비례보다 적게',false,false,false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
    -- B. 기본 재료 — 밀가루·전분
    ('박력분','Cake flour',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,13,1,8,0,78,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('중력분','All-purpose flour',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,13,1,11,0,75,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('강력분','Bread flour',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,13,1.5,13,0,72.5,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('통밀가루','Wholemeal flour',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,12,2,13,0,73,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('호밀가루','Rye flour',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,12,1.7,10,1,75.3,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('쌀가루','Rice flour',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,12,1,6,0,81,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('아몬드 가루','Almond flour',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,4,52,21,4,19,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('옥수수 전분','Cornstarch',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,12,0,0.3,0,87.7,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('감자 전분','Potato starch',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,18,0,0.1,0,81.9,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('코코아 파우더','Cocoa powder',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,false,true,3,11,20,2,64,NULL,NULL,NULL,NULL,NULL,'초콜릿','standard'),
    -- 당류
    ('백설탕','Caster sugar',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,0,0,0,100,0,NULL,NULL,'sucrose',100,100,NULL,'standard'),
    ('분당','Icing sugar',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,0,0,0,97,3,NULL,NULL,'sucrose',100,100,NULL,'standard'),
    ('흑설탕','Brown sugar',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,2,0,0,97,1,NULL,NULL,'sucrose',100,100,'캐러멜·당','standard'),
    ('황설탕','Demerara sugar',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,1,0,0,98,1,NULL,NULL,'sucrose',100,100,'캐러멜·당','standard'),
    ('꿀','Honey',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,17,0,0.3,82,0.7,NULL,NULL,'invert',190,130,'캐러멜·당','standard'),
    ('메이플 시럽','Maple syrup',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,32,0,0,67,1,NULL,NULL,'sucrose',100,100,'캐러멜·당','standard'),
    ('글루코스 시럽','Glucose syrup',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,20,0,0,80,0,NULL,NULL,'glucose_syrup',60,50,NULL,'standard'),
    ('전화당','Invert sugar',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,22,0,0,78,0,NULL,NULL,'invert',190,130,NULL,'standard'),
    ('포도당','Dextrose',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,8,0,0,92,0,NULL,NULL,'dextrose',190,70,NULL,'standard'),
    -- 유제품 (fat_type = dairy)
    ('무염 버터','Unsalted butter',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,16,82,1,0.5,0.5,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('가염 버터','Salted butter',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,16,81,1,0.5,1.5,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('우유','Whole milk',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,88,3.5,3.3,4.8,0.4,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('생크림 35%','Cream 35%',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,58,35,2,3,2,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('생크림 45%','Cream 45%',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,49,45,2,2.5,1.5,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('마스카포네','Mascarpone',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,50,42,4,3,1,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('크림치즈','Cream cheese',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,55,33,6,3,3,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('사워크림','Sour cream',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,71,20,3,4,2,NULL,'dairy',NULL,NULL,NULL,'발효·산미','standard'),
    ('크렘 프레슈','Crème fraîche',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,60,33,2.5,3,1.5,NULL,'dairy',NULL,NULL,NULL,'발효·산미','standard'),
    ('플레인 요거트','Plain yoghurt',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,85,3.5,4,5,2.5,NULL,'dairy',NULL,NULL,NULL,'발효·산미','standard'),
    ('탈지분유','Skimmed milk powder',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,false,true,4,1,35,52,8,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    ('연유','Condensed milk',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,27,8.5,8,55,1.5,NULL,'dairy',NULL,NULL,NULL,'유제품','standard'),
    -- 계란
    ('전란','Whole egg',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,true,false,75,10,12.5,0.7,1.8,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('노른자','Egg yolk',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,50,32,16,0.6,1.4,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('흰자','Egg white',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,true,false,true,false,88,0.2,10.5,0.7,0.6,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    -- 유지
    ('식용유','Vegetable oil',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,0,100,0,0,0,NULL,'vegetable',NULL,NULL,NULL,NULL,'standard'),
    ('올리브유','Olive oil',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,0,100,0,0,0,NULL,'vegetable',NULL,NULL,NULL,NULL,'standard'),
    ('카카오버터','Cocoa butter',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,0,100,0,0,0,NULL,'cocoa_butter',NULL,NULL,NULL,NULL,'standard'),
    ('쇼트닝','Shortening',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,0,100,0,0,0,NULL,'vegetable',NULL,NULL,NULL,NULL,'standard'),
    -- 초콜릿 (fat_type = cocoa_butter)
    ('다크초콜릿 70%','Dark chocolate 70%',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,1,40,8,29,22,NULL,'cocoa_butter',NULL,NULL,NULL,'초콜릿','standard'),
    ('다크초콜릿 55%','Dark chocolate 55%',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,1,33,6,45,15,NULL,'cocoa_butter',NULL,NULL,NULL,'초콜릿','standard'),
    ('밀크초콜릿','Milk chocolate',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,1,33,7,50,9,NULL,'cocoa_butter',NULL,NULL,NULL,'초콜릿','standard'),
    ('화이트초콜릿','White chocolate',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,1,33,6,55,5,NULL,'cocoa_butter',NULL,NULL,NULL,'초콜릿','standard'),
    ('카카오닙스','Cocoa nibs',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,false,true,2,50,14,1,33,NULL,'cocoa_butter',NULL,NULL,NULL,'초콜릿','standard'),
    -- 견과
    ('아몬드','Almond',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,4,50,21,4,21,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('헤이즐넛','Hazelnut',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,5,61,15,4,15,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('피스타치오','Pistachio',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,4,45,20,8,23,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('호두','Walnut',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,4,65,15,3,13,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('피칸','Pecan',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,4,72,9,4,11,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('아몬드 페이스트','Almond paste',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,8,27,11,45,9,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('프랄리네','Praliné',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,false,2,35,8,48,7,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    ('참깨 페이스트','Tahini',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,false,true,3,54,17,1,25,NULL,NULL,NULL,NULL,NULL,'견과','standard'),
    -- 과일 (무가당 퓨레 기준)
    ('딸기 퓨레','Strawberry purée',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,88,0.3,0.7,8,3,NULL,NULL,NULL,NULL,NULL,'베리','standard'),
    ('라즈베리 퓨레','Raspberry purée',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,85,0.7,1.2,9,4,NULL,NULL,NULL,NULL,NULL,'베리','standard'),
    ('블루베리 퓨레','Blueberry purée',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,84,0.3,0.7,12,3,NULL,NULL,NULL,NULL,NULL,'베리','standard'),
    ('망고 퓨레','Mango purée',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,82,0.4,0.8,14,2.8,NULL,NULL,NULL,NULL,NULL,'열대','standard'),
    ('패션프루트 퓨레','Passion fruit purée',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,73,0.7,2.2,11,13,NULL,NULL,NULL,NULL,NULL,'열대','standard'),
    ('사과 퓨레','Apple purée',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,85,0.2,0.3,11,3.5,NULL,NULL,NULL,NULL,NULL,'사과·배','standard'),
    ('레몬즙','Lemon juice',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,91,0.2,0.4,2.5,5.9,NULL,NULL,NULL,NULL,NULL,'시트러스','standard'),
    ('오렌지즙','Orange juice',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,88,0.2,0.7,9,2.1,NULL,NULL,NULL,NULL,NULL,'시트러스','standard'),
    ('바나나','Banana',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,75,0.3,1.1,12,11.6,NULL,NULL,NULL,NULL,NULL,'열대','standard'),
    ('코코넛 밀크','Coconut milk',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,true,true,false,73,24,2.3,3,0.7,NULL,NULL,NULL,NULL,NULL,'열대','standard'),
    -- 기타
    ('물','Water',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,100,0,0,0,0,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('에스프레소','Espresso',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,97,0,0.2,0,2.8,NULL,NULL,NULL,NULL,NULL,'로스팅','standard'),
    ('말차 파우더','Matcha powder',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,false,true,5,5,29,3,58,NULL,NULL,NULL,NULL,NULL,NULL,'standard'),
    ('바닐라 빈','Vanilla bean',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,false,false,15,1,1,10,73,NULL,NULL,NULL,NULL,NULL,'바닐라·크리미','standard'),
    -- 주류 (comp_alcohol 사용)
    ('럼','Rum',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,60,0,0,0,0,40,NULL,NULL,NULL,NULL,'주류','standard'),
    ('그랑 마니에','Grand Marnier',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,50,0,0,10,0,40,NULL,NULL,NULL,NULL,'주류','standard'),
    ('아마레토','Amaretto',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,42,0,0,30,0,28,NULL,NULL,NULL,NULL,'주류','standard'),
    ('칼바도스','Calvados',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,60,0,0,0,0,40,NULL,NULL,NULL,NULL,'주류','standard'),
    ('키르슈','Kirsch',false,NULL,NULL,NULL,NULL,'linear',1.0,NULL,false,false,true,false,60,0,0,0,0,40,NULL,NULL,NULL,NULL,'주류','standard')
  ) AS v(name, name_en, isfunc, basis, rmin, rmax, bloom, smode, k, pnote, t, n, m, d, water, fat, protein, sugar, osol, alc, ftype, stype, pac, pod, fam, csrc)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ingredients i
    WHERE i.user_id = p_user_id
      AND (i.name = v.name OR (v.name_en IS NOT NULL AND i.name_en = v.name_en))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cakes_id UUID;
BEGIN
  INSERT INTO public.categories (user_id, name, color, sort_order)
  VALUES (NEW.id, 'SAMPLE_CAKES', '#C9B79C', 1)
  RETURNING id INTO cakes_id;

  INSERT INTO public.categories (user_id, name, parent_id, color, sort_order)
  VALUES (NEW.id, 'SAMPLE_CHIFFON', cakes_id, '#D8CBB4', 1);

  INSERT INTO public.categories (user_id, name, color, sort_order) VALUES
    (NEW.id, 'SAMPLE_TARTS', '#B9C2B0', 2),
    (NEW.id, 'SAMPLE_COOKIES', '#CDBBB0', 3),
    (NEW.id, 'SAMPLE_CREAMS', '#BFC4CC', 4);

  INSERT INTO public.ingredient_functions (user_id, name, name_en, is_default, key, sort_order) VALUES
    (NEW.id, 'FAT', 'FAT', true, 'fat', 1),
    (NEW.id, 'PROTEIN', 'PROTEIN', true, null, 2),
    (NEW.id, 'STRUCTURE', 'STRUCTURE', true, 'structure', 3),
    (NEW.id, 'STARCH', 'STARCH', true, 'starch', 4),
    (NEW.id, 'AERATION', 'AERATION', true, null, 5),
    (NEW.id, 'WATER', 'WATER', true, 'water', 6),
    (NEW.id, 'SWEETENER', 'SWEETENER', true, 'sweetener', 7),
    (NEW.id, 'FLAVOUR', 'FLAVOUR', true, null, 8),
    (NEW.id, 'ACID', 'ACID', true, null, 9),
    (NEW.id, 'LEAVENING', 'LEAVENING', true, null, 10),
    (NEW.id, 'STABILISER', 'STABILISER', true, null, 11),
    (NEW.id, 'MOUTHFEEL', 'MOUTHFEEL', true, null, 12),
    (NEW.id, 'EMULSIFIER', 'EMULSIFIER', true, null, 13);

  INSERT INTO public.process_categories (user_id, name, color, sort_order, is_default) VALUES
    (NEW.id, 'PREP',    '#C9B79C', 1, true),
    (NEW.id, 'MIXING',  '#D8CBB4', 2, true),
    (NEW.id, 'BAKING',  '#CDBBB0', 3, true),
    (NEW.id, 'COOLING', '#BFC4CC', 4, true),
    (NEW.id, 'DECOR',   '#B9C2B0', 5, true);

  PERFORM public.seed_flavour_families(NEW.id);
  PERFORM public.seed_default_ingredients(NEW.id);

  RETURN NEW;
END;
$function$;

DO $backfill$
DECLARE
  u record;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_default_ingredients(u.id);
  END LOOP;
END;
$backfill$;