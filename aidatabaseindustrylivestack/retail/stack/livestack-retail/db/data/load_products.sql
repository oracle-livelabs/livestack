/*
 * load_products.sql
 * sporting-goods products across 50 brands
 * Uses PL/SQL to generate the Seer Sporting Goods product catalog
 */

SET SERVEROUTPUT ON
PROMPT Loading products...

DECLARE
    TYPE t_prod IS RECORD (
        bslug VARCHAR2(100),
        pname VARCHAR2(300),
        cat   VARCHAR2(100),
        subcat VARCHAR2(100),
        price NUMBER(10,2),
        cost  NUMBER(10,2),
        wt    NUMBER(8,3),
        tags  VARCHAR2(1000)
    );
    TYPE t_prod_arr IS TABLE OF t_prod;
    v_prods t_prod_arr := t_prod_arr();
    v_brand_id NUMBER;
    v_sku VARCHAR2(50);
    v_idx NUMBER := 0;

    PROCEDURE add_prod(p_slug VARCHAR2, p_name VARCHAR2, p_cat VARCHAR2, p_sub VARCHAR2,
                       p_price NUMBER, p_cost NUMBER, p_wt NUMBER, p_tags VARCHAR2) IS
        v_rec t_prod;
    BEGIN
        v_rec.bslug := p_slug; v_rec.pname := p_name; v_rec.cat := p_cat;
        v_rec.subcat := p_sub; v_rec.price := p_price; v_rec.cost := p_cost;
        v_rec.wt := p_wt; v_rec.tags := p_tags;
        v_prods.EXTEND; v_prods(v_prods.COUNT) := v_rec;
    END;
BEGIN
    -- UrbanPulse (Athletic Apparel)
    add_prod('urbanpulse','StormRunner Trail Shell','Athletic Apparel','Outerwear',189.99,72,1.2,'athletic-apparel,outerwear,sporting-goods');
    add_prod('urbanpulse','RidgeLine Fleece Hoodie','Athletic Apparel','Trail Tops',89.99,32,0.6,'athletic-apparel,trail-tops,sporting-goods');
    add_prod('urbanpulse','TrailFlex Training Joggers','Athletic Apparel','Training Bottoms',74.99,28,0.4,'athletic-apparel,training-bottoms,sporting-goods');
    add_prod('urbanpulse','Summit Graphic Training Tee','Athletic Apparel','Base Layers',39.99,12,0.2,'athletic-apparel,base-layers,sporting-goods');
    add_prod('urbanpulse','Urban Trail Daypack','Athletic Apparel','Packs',129.99,48,0.8,'athletic-apparel,packs,sporting-goods');

    -- TechNova (Sports Tech)
    add_prod('technova','FieldCoach Training Tablet','Sports Tech','Training Tablets',899.99,420,0.68,'sports-tech,training-tablets,sporting-goods');
    add_prod('technova','TrailRun Sport Earbuds','Sports Tech','Sport Audio',199.99,65,0.05,'sports-tech,sport-audio,sporting-goods');
    add_prod('technova','RaceDay Docking Hub','Sports Tech','GPS Accessories',149.99,52,0.35,'sports-tech,gps-accessories,sporting-goods');
    add_prod('technova','SummitPulse GPS Watch','Sports Tech','Wearables',449.99,180,0.06,'sports-tech,wearables,sporting-goods');
    add_prod('technova','Expedition Power Bank','Sports Tech','Power',79.99,28,0.45,'sports-tech,power,sporting-goods');

    -- GlowKin (Outdoor Care)
    add_prod('glowkin','TrailGuard Anti-Chafe Balm','Outdoor Care','Trail Care',68.99,18,0.1,'outdoor-care,trail-care,sporting-goods');
    add_prod('glowkin','Recovery Cooling Gel','Outdoor Care','Recovery',54.99,14,0.15,'outdoor-care,recovery,sporting-goods');
    add_prod('glowkin','SummitShield Sunscreen Stick','Outdoor Care','Sun Protection',42.99,11,0.12,'outdoor-care,sun-protection,sporting-goods');
    add_prod('glowkin','DewPoint Hydration Spray','Outdoor Care','Skin Protection',28.99,7,0.12,'outdoor-care,skin-protection,sporting-goods');
    add_prod('glowkin','Vitamin Recovery Balm','Outdoor Care','Anti-Chafe',58.99,15,0.1,'outdoor-care,anti-chafe,sporting-goods');

    -- PeakForm (Fitness)
    add_prod('peakform','TitanGrip Dumbbells 50lb','Fitness','Weights',249.99,95,22.7,'titangrip-dumbbells-50lb,fitness,training,sporting-goods');
    add_prod('peakform','FlexBand Pro Set','Fitness','Accessories',49.99,12,0.5,'flexband-pro-set,fitness,training,sporting-goods');
    add_prod('peakform','AeroSpin Cycle','Fitness','Cardio',1299.99,520,45,'aerospin-cycle,fitness,training,sporting-goods');
    add_prod('peakform','CoreBlast Ab Roller','Fitness','Accessories',34.99,9,1.2,'coreblast-ab-roller,fitness,training,sporting-goods');
    add_prod('peakform','HydroShock Shaker','Fitness','Nutrition',24.99,6,0.3,'hydroshock-shaker,fitness,training,sporting-goods');

    -- NestCraft (Outdoor Lifestyle)
    add_prod('nestcraft','TrailBrew Pour-Over Kit','Outdoor Lifestyle','Camp Kitchen',89.99,32,1.5,'outdoor-lifestyle,camp-kitchen,sporting-goods');
    add_prod('nestcraft','Stadium Travel Blanket','Outdoor Lifestyle','Travel Comfort',119.99,42,1.8,'outdoor-lifestyle,travel-comfort,sporting-goods');
    add_prod('nestcraft','Indoor Training Garden Kit','Outdoor Lifestyle','Hydration',149.99,55,3.2,'outdoor-lifestyle,hydration,sporting-goods');
    add_prod('nestcraft','Trailhead Gear Clock','Outdoor Lifestyle','Storage',79.99,28,0.8,'outdoor-lifestyle,storage,sporting-goods');
    add_prod('nestcraft','Locker Room Organizer Set','Outdoor Lifestyle','Training Setup',59.99,18,2.1,'outdoor-lifestyle,training-setup,sporting-goods');

    -- VoltEdge (Sports Tech)
    add_prod('voltedge','FieldCoach Training Tablet','Sports Tech','Training Tablets',89.99,32,0.3,'sports-tech,training-tablets,sporting-goods');
    add_prod('voltedge','TrailRun Sport Earbuds','Sports Tech','Sport Audio',549.99,220,8.5,'sports-tech,sport-audio,sporting-goods');
    add_prod('voltedge','RaceDay Docking Hub','Sports Tech','GPS Accessories',169.99,58,0.9,'sports-tech,gps-accessories,sporting-goods');
    add_prod('voltedge','SummitPulse GPS Watch','Sports Tech','Wearables',99.99,35,0.08,'sports-tech,wearables,sporting-goods');
    add_prod('voltedge','Expedition Power Bank','Sports Tech','Power',129.99,42,0.15,'sports-tech,power,sporting-goods');

    -- SonicWave (Training Audio)
    add_prod('sonicwave','TrailBase Portable Speaker','Training Audio','Speakers',299.99,110,4.5,'training-audio,speakers,sporting-goods');
    add_prod('sonicwave','StudioRun Training Headphones','Training Audio','Headphones',349.99,120,0.35,'training-audio,headphones,sporting-goods');
    add_prod('sonicwave','CoachMic USB Microphone','Training Audio','Coaching Audio',149.99,52,0.6,'training-audio,coaching-audio,sporting-goods');
    add_prod('sonicwave','GameDay Soundbar','Training Audio','Stadium Audio',449.99,175,5.2,'training-audio,stadium-audio,sporting-goods');
    add_prod('sonicwave','ClipTrail Mini Speaker','Training Audio','Waterproof Audio',59.99,18,0.2,'training-audio,waterproof-audio,sporting-goods');

    -- TrailBlaze (Outdoor)
    add_prod('trailblaze','Summit 65L Backpack','Outdoor','Backpacks',229.99,85,1.8,'summit-65l-backpack,outdoor,trail,hiking,sporting-goods');
    add_prod('trailblaze','AllTerrain Hiking Boots','Outdoor','Footwear',189.99,68,1.6,'allterrain,hiking-boots,waterproof,trail,hero-product');
    add_prod('trailblaze','UltraLight Tent 2P','Outdoor','Shelter',399.99,155,1.5,'ultralight-tent-2p,outdoor,trail,hiking,sporting-goods');
    add_prod('trailblaze','ThermoFlask 32oz','Outdoor','Hydration',44.99,14,0.5,'thermoflask-32oz,outdoor,trail,hiking,sporting-goods');
    add_prod('trailblaze','HeadLamp 1000 Lumens','Outdoor','Lighting',69.99,22,0.12,'headlamp-1000-lumens,outdoor,trail,hiking,sporting-goods');

    -- LuxeThread (Athletic Apparel)
    add_prod('luxethread','StormRunner Trail Shell','Athletic Apparel','Outerwear',895.00,320,2.1,'athletic-apparel,outerwear,sporting-goods');
    add_prod('luxethread','RidgeLine Fleece Hoodie','Athletic Apparel','Trail Tops',650.00,230,0.6,'athletic-apparel,trail-tops,sporting-goods');
    add_prod('luxethread','TrailFlex Training Joggers','Athletic Apparel','Training Bottoms',425.00,165,0.8,'athletic-apparel,training-bottoms,sporting-goods');
    add_prod('luxethread','Summit Graphic Training Tee','Athletic Apparel','Base Layers',275.00,95,0.05,'athletic-apparel,base-layers,sporting-goods');
    add_prod('luxethread','Urban Trail Daypack','Athletic Apparel','Packs',195.00,72,0.3,'athletic-apparel,packs,sporting-goods');

    -- CloudStep (Footwear)
    add_prod('cloudstep','AirGlide Runner','Footwear','Running',149.99,52,0.6,'airglide-runner,footwear,trail,running,sporting-goods');
    add_prod('cloudstep','StreetFlex Sneaker','Footwear','Casual',119.99,42,0.7,'streetflex-sneaker,footwear,trail,running,sporting-goods');
    add_prod('cloudstep','TrailGrip Hiker','Footwear','Hiking',179.99,65,0.9,'trailgrip-hiker,footwear,trail,running,sporting-goods');
    add_prod('cloudstep','SlipStream Slide','Footwear','Sandals',49.99,15,0.3,'slipstream-slide,footwear,trail,running,sporting-goods');
    add_prod('cloudstep','UrbanDash Trainer','Footwear','Training',134.99,48,0.65,'urbandash-trainer,footwear,trail,running,sporting-goods');

    -- PixelCraft (Training Tech)
    add_prod('pixelcraft','RaceSim Performance GPU','Training Tech','Simulation',799.99,380,1.8,'training-tech,simulation,sporting-goods');
    add_prod('pixelcraft','Recovery Command Chair','Training Tech','Recovery Seating',449.99,165,18,'training-tech,recovery-seating,sporting-goods');
    add_prod('pixelcraft','DrillSwitch Training Controller','Training Tech','Controllers',79.99,28,0.3,'training-tech,controllers,sporting-goods');
    add_prod('pixelcraft','PracticeStream Capture Card','Training Tech','Video Analysis',199.99,72,0.15,'training-tech,video-analysis,sporting-goods');
    add_prod('pixelcraft','CoachView Curved Display','Training Tech','Displays',699.99,280,9.5,'training-tech,displays,sporting-goods');

    -- OmniWear (Sports Wearables)
    add_prod('omniwear','OmniRing Performance Tracker','Sports Wearables','Trackers',349.99,125,0.008,'sports-wearables,trackers,sporting-goods');
    add_prod('omniwear','RouteGuide AR Sport Glasses','Sports Wearables','Eyewear',1499.99,620,0.05,'sports-wearables,eyewear,sporting-goods');
    add_prod('omniwear','OmniBand Fitness Pro','Sports Wearables','Bands',249.99,85,0.03,'sports-wearables,bands,sporting-goods');
    add_prod('omniwear','ClipCoach Audio Pod','Sports Wearables','Audio',599.99,210,0.006,'sports-wearables,audio,sporting-goods');
    add_prod('omniwear','Posture Coach Clip','Sports Wearables','Recovery',129.99,42,0.02,'sports-wearables,recovery,sporting-goods');

    -- More brands with fewer products each
    -- AtomFit
    add_prod('atomfit','OmniRing Performance Tracker','Sports Wearables','Trackers',299.99,105,0.05,'sports-wearables,trackers,sporting-goods');
    add_prod('atomfit','FitScale Pro','Fitness','Scales',99.99,35,2.5,'fitscale-pro,fitness,training,sporting-goods');
    add_prod('atomfit','RecoveryGun Mini','Fitness','Recovery',149.99,52,0.6,'recoverygun-mini,fitness,training,sporting-goods');

    -- CrystalView (Sport Eyewear)
    add_prod('crystalview','Titanium Trail Aviators','Sport Eyewear','Sunglasses',225.00,82,0.03,'sport-eyewear,sunglasses,sporting-goods');
    add_prod('crystalview','BlueShield Training Glasses','Sport Eyewear','Protective Eyewear',89.99,28,0.025,'sport-eyewear,protective-eyewear,sporting-goods');
    add_prod('crystalview','Sport Wrap Polarized Shades','Sport Eyewear','Running',159.99,55,0.035,'sport-eyewear,running,sporting-goods');

    -- ZenBrew (Sports Nutrition)
    add_prod('zenbrew','Matcha Endurance Starter Kit','Sports Nutrition','Hydration',49.99,16,0.8,'sports-nutrition,hydration,sporting-goods');
    add_prod('zenbrew','Cold Brew Recovery Tower','Sports Nutrition','Recovery',79.99,28,2.5,'sports-nutrition,recovery,sporting-goods');
    add_prod('zenbrew','Herbal Recovery Blend','Sports Nutrition','Energy',24.99,7,0.15,'sports-nutrition,energy,sporting-goods');

    -- IronCore
    add_prod('ironcore','PowerRack Home Gym','Fitness','Equipment',1499.99,580,90,'powerrack-home-gym,fitness,training,sporting-goods');
    add_prod('ironcore','Olympic Barbell 45lb','Fitness','Weights',299.99,115,20.4,'olympic-barbell-45lb,fitness,training,sporting-goods');
    add_prod('ironcore','Rubber Hex Dumbbells','Fitness','Weights',89.99,32,9.1,'rubber-hex-dumbbells,fitness,training,sporting-goods');

    -- EverGreen (Eco Outdoor Gear)
    add_prod('evergreen','RaceDay Docking Hub','Sports Tech','GPS Accessories',69.99,24,0.3,'sports-tech,gps-accessories,sporting-goods');
    add_prod('evergreen','SummitPulse GPS Watch','Sports Tech','Wearables',49.99,16,0.8,'sports-tech,wearables,sporting-goods');
    add_prod('evergreen','Urban Trail Daypack','Athletic Apparel','Packs',45.99,14,0.4,'athletic-apparel,packs,sporting-goods');

    -- PureRoots (Recovery)
    add_prod('pureroots','Adaptogen Recovery Powder','Recovery','Supplements',39.99,12,0.25,'recovery,supplements,sporting-goods');
    add_prod('pureroots','Joint Support Peptides','Recovery','Recovery',44.99,14,0.3,'recovery,recovery,sporting-goods');
    add_prod('pureroots','Magnesium Recovery Gummies','Recovery','Sleep',29.99,8,0.2,'recovery,sleep,sporting-goods');

    -- AuraScent (Outdoor Care)
    add_prod('aurascent','DewPoint Hydration Spray','Outdoor Care','Skin Protection',125.00,38,0.15,'outdoor-care,skin-protection,sporting-goods');
    add_prod('aurascent','Locker Room Organizer Set','Outdoor Lifestyle','Training Setup',42.99,12,0.5,'outdoor-lifestyle,training-setup,sporting-goods');
    add_prod('aurascent','TrailBrew Pour-Over Kit','Outdoor Lifestyle','Camp Kitchen',58.99,18,0.8,'outdoor-lifestyle,camp-kitchen,sporting-goods');

    -- BoldBrew (Sports Nutrition)
    add_prod('boldbrew','Matcha Endurance Starter Kit','Sports Nutrition','Hydration',48.99,18,5.4,'sports-nutrition,hydration,sporting-goods');
    add_prod('boldbrew','Cold Brew Recovery Tower','Sports Nutrition','Recovery',32.99,11,0.9,'sports-nutrition,recovery,sporting-goods');
    add_prod('boldbrew','Herbal Recovery Blend','Sports Nutrition','Energy',19.99,6,0.3,'sports-nutrition,energy,sporting-goods');

    -- DarkMatter (Training Tech)
    add_prod('darkmatter','CoachView Curved Display','Training Tech','Displays',49.99,15,0.8,'training-tech,displays,sporting-goods');
    add_prod('darkmatter','RaceSim Performance GPU','Training Tech','Simulation',179.99,62,0.4,'training-tech,simulation,sporting-goods');
    add_prod('darkmatter','Recovery Command Chair','Training Tech','Recovery Seating',159.99,58,8.5,'training-tech,recovery-seating,sporting-goods');

    -- FlameCook (Camp Cooking)
    add_prod('flamecook','Cast Iron Camp Skillet 12in','Camp Cooking','Cookware',69.99,24,3.5,'camp-cooking,cookware,sporting-goods');
    add_prod('flamecook','Smart Grill Thermometer','Camp Cooking','Food Prep',49.99,16,0.08,'camp-cooking,food-prep,sporting-goods');
    add_prod('flamecook','Camp Chef Knife Set','Camp Cooking','Cutlery',299.99,110,2.8,'camp-cooking,cutlery,sporting-goods');

    -- HaloVision
    add_prod('halovision','FieldCoach Training Tablet','Sports Tech','Training Tablets',2499.99,1100,0.45,'sports-tech,training-tablets,sporting-goods');
    add_prod('halovision','TrailRun Sport Earbuds','Sports Tech','Sport Audio',199.99,72,0.6,'sports-tech,sport-audio,sporting-goods');
    add_prod('halovision','CoachMic USB Microphone','Training Audio','Coaching Audio',299.99,105,0.05,'training-audio,coaching-audio,sporting-goods');

    -- Additional products to reach ~250
    add_prod('urbanpulse','Cyber Mesh Sneakers','Footwear','Sneakers',159.99,58,0.7,'cyber-mesh-sneakers,footwear,trail,running,sporting-goods');
    add_prod('urbanpulse','Urban Trail Daypack','Athletic Apparel','Packs',64.99,22,0.3,'athletic-apparel,packs,sporting-goods');
    add_prod('urbanpulse','StormRunner Trail Shell','Athletic Apparel','Outerwear',49.99,15,0.25,'athletic-apparel,outerwear,sporting-goods');
    add_prod('technova','TrailRun Sport Earbuds','Sports Tech','Sport Audio',149.99,48,0.04,'sports-tech,sport-audio,sporting-goods');
    add_prod('technova','RaceDay Docking Hub','Sports Tech','GPS Accessories',29.99,8,0.15,'sports-tech,gps-accessories,sporting-goods');
    add_prod('glowkin','DewPoint Hydration Spray','Outdoor Care','Skin Protection',72.99,20,0.12,'outdoor-care,skin-protection,sporting-goods');
    add_prod('glowkin','Vitamin Recovery Balm','Outdoor Care','Anti-Chafe',22.99,6,0.03,'outdoor-care,anti-chafe,sporting-goods');
    add_prod('peakform','Yoga Mat Premium','Fitness','Yoga',89.99,28,2.5,'yoga-mat-premium,fitness,training,sporting-goods');
    add_prod('peakform','Pull-Up Bar Doorway','Fitness','Equipment',44.99,14,2.8,'pull-up-bar-doorway,fitness,training,sporting-goods');
    add_prod('nestcraft','Indoor Training Garden Kit','Outdoor Lifestyle','Hydration',69.99,22,1.8,'outdoor-lifestyle,hydration,sporting-goods');
    add_prod('nestcraft','Trailhead Gear Clock','Outdoor Lifestyle','Storage',54.99,18,1.2,'outdoor-lifestyle,storage,sporting-goods');
    add_prod('voltedge','Expedition Power Bank','Sports Tech','Power',179.99,65,0.08,'sports-tech,power,sporting-goods');
    add_prod('voltedge','FieldCoach Training Tablet','Sports Tech','Training Tablets',299.99,110,0.9,'sports-tech,training-tablets,sporting-goods');
    add_prod('sonicwave','StudioRun Training Headphones','Training Audio','Headphones',249.99,88,5.5,'training-audio,headphones,sporting-goods');
    add_prod('sonicwave','CoachMic USB Microphone','Training Audio','Coaching Audio',199.99,72,3.8,'training-audio,coaching-audio,sporting-goods');
    add_prod('trailblaze','Camping Hammock','Outdoor','Shelter',59.99,18,0.6,'camping-hammock,outdoor,trail,hiking,sporting-goods');
    add_prod('trailblaze','Trekking Poles Carbon','Outdoor','Accessories',119.99,42,0.5,'trekking-poles-carbon,outdoor,trail,hiking,sporting-goods');
    add_prod('luxethread','StormRunner Trail Shell','Athletic Apparel','Outerwear',145.00,52,0.2,'athletic-apparel,outerwear,sporting-goods');
    add_prod('cloudstep','WinterGrip Boot','Footwear','Boots',199.99,72,1.1,'wintergrip-boot,footwear,trail,running,sporting-goods');
    add_prod('pixelcraft','DrillSwitch Training Controller','Training Tech','Controllers',129.99,45,0.3,'training-tech,controllers,sporting-goods');
    add_prod('omniwear','ClipCoach Audio Pod','Sports Wearables','Audio',199.99,68,0.05,'sports-wearables,audio,sporting-goods');
    add_prod('frostbyte','Expedition Power Bank','Sports Tech','Power',79.99,28,1.2,'sports-tech,power,sporting-goods');
    add_prod('frostbyte','FieldCoach Training Tablet','Sports Tech','Training Tablets',149.99,52,0.85,'sports-tech,training-tablets,sporting-goods');
    add_prod('frostbyte','TrailRun Sport Earbuds','Sports Tech','Sport Audio',39.99,12,0.3,'sports-tech,sport-audio,sporting-goods');
    add_prod('wildroam','Trail Organizer Cube Set','Outdoor Travel','Gear Storage',34.99,10,0.4,'outdoor-travel,gear-storage,sporting-goods');
    add_prod('wildroam','Expedition Neck Pillow','Outdoor Travel','Travel Comfort',29.99,8,0.3,'outdoor-travel,travel-comfort,sporting-goods');
    add_prod('wildroam','RFID Trail Passport Wallet','Outdoor Travel','Security',24.99,7,0.1,'outdoor-travel,security,sporting-goods');
    add_prod('flexihome','TrailBrew Pour-Over Kit','Outdoor Lifestyle','Camp Kitchen',34.99,10,0.3,'outdoor-lifestyle,camp-kitchen,sporting-goods');
    add_prod('flexihome','Stadium Travel Blanket','Outdoor Lifestyle','Travel Comfort',199.99,72,12,'outdoor-lifestyle,travel-comfort,sporting-goods');
    add_prod('flexihome','Indoor Training Garden Kit','Outdoor Lifestyle','Hydration',399.99,155,3.5,'outdoor-lifestyle,hydration,sporting-goods');
    add_prod('moonglow','DewPoint Hydration Spray','Outdoor Care','Skin Protection',38.99,10,0.1,'outdoor-care,skin-protection,sporting-goods');
    add_prod('moonglow','Vitamin Recovery Balm','Outdoor Care','Anti-Chafe',28.99,7,0.08,'outdoor-care,anti-chafe,sporting-goods');
    add_prod('terragear','Climbing Harness Pro','Outdoor','Climbing',129.99,45,0.5,'climbing-harness-pro,outdoor,trail,hiking,sporting-goods');
    add_prod('terragear','4-Season Tent 3P','Outdoor','Shelter',549.99,215,2.8,'4-season-tent-3p,outdoor,trail,hiking,sporting-goods');
    add_prod('neonnight','TrailFlex Training Joggers','Athletic Apparel','Training Bottoms',149.99,52,0.8,'athletic-apparel,training-bottoms,sporting-goods');
    add_prod('neonnight','Summit Graphic Training Tee','Athletic Apparel','Base Layers',39.99,12,0.15,'athletic-apparel,base-layers,sporting-goods');
    add_prod('aquafit','Swim Tracker Watch','Fitness','Wearables',179.99,62,0.04,'swim-tracker-watch,fitness,training,sporting-goods');
    add_prod('aquafit','TrailBase Portable Speaker','Training Audio','Speakers',69.99,24,0.03,'training-audio,speakers,sporting-goods');
    add_prod('stridepro','Marathon Elite Racer','Footwear','Running',219.99,78,0.22,'marathon-elite-racer,footwear,trail,running,sporting-goods');
    add_prod('stridepro','CrossFit WOD Trainer','Footwear','Training',159.99,55,0.65,'crossfit-wod-trainer,footwear,trail,running,sporting-goods');
    add_prod('novaskin','DewPoint Hydration Spray','Outdoor Care','Skin Protection',32.99,9,0.2,'outdoor-care,skin-protection,sporting-goods');
    add_prod('novaskin','Vitamin Recovery Balm','Outdoor Care','Anti-Chafe',28.99,8,0.1,'outdoor-care,anti-chafe,sporting-goods');
    add_prod('thunderlift','Adjustable Bench','Fitness','Equipment',349.99,125,22,'adjustable-bench,fitness,training,sporting-goods');
    add_prod('thunderlift','Battle Ropes 50ft','Fitness','Equipment',119.99,42,11,'battle-ropes-50ft,fitness,training,sporting-goods');
    add_prod('rustichome','Indoor Training Garden Kit','Outdoor Lifestyle','Hydration',699.99,280,25,'outdoor-lifestyle,hydration,sporting-goods');
    add_prod('rustichome','Trailhead Gear Clock','Outdoor Lifestyle','Storage',34.99,10,0.5,'outdoor-lifestyle,storage,sporting-goods');
    add_prod('electravibe','ClipTrail Mini Speaker','Training Audio','Waterproof Audio','299.99',105,2.2,'training-audio,waterproof-audio,sporting-goods');
    add_prod('electravibe','TrailBase Portable Speaker','Training Audio','Speakers',179.99,62,4.5,'training-audio,speakers,sporting-goods');
    add_prod('zephyrwind','Ultralight Rain Jacket','Outdoor','Outerwear',149.99,52,0.2,'ultralight-rain-jacket,outdoor,trail,hiking,sporting-goods');
    add_prod('zephyrwind','Trekking Backpack 45L','Outdoor','Backpacks',179.99,65,1.4,'trekking-backpack-45l,outdoor,trail,hiking,sporting-goods');
    add_prod('quantumleap','SummitPulse GPS Watch','Sports Tech','Wearables',3999.99,1800,12,'sports-tech,wearables,sporting-goods');
    add_prod('quantumleap','Expedition Power Bank','Sports Tech','Power',799.99,320,0.8,'sports-tech,power,sporting-goods');
    add_prod('silkveil','StormRunner Trail Shell','Athletic Apparel','Outerwear',175.00,62,0.35,'athletic-apparel,outerwear,sporting-goods');
    add_prod('silkveil','RidgeLine Fleece Hoodie','Athletic Apparel','Trail Tops',89.00,30,0.08,'athletic-apparel,trail-tops,sporting-goods');
    add_prod('flamecook','Cast Iron Camp Skillet 12in','Camp Cooking','Cookware',129.99,45,5.5,'camp-cooking,cookware,sporting-goods');
    add_prod('flamecook','Smart Grill Thermometer','Camp Cooking','Food Prep',59.99,20,0.8,'camp-cooking,food-prep,sporting-goods');
    add_prod('mindfultech','Magnesium Recovery Gummies','Recovery','Sleep',199.99,72,0.06,'recovery,sleep,sporting-goods');
    add_prod('mindfultech','Adaptogen Recovery Powder','Recovery','Supplements',129.99,45,0.03,'recovery,supplements,sporting-goods');
    add_prod('apexride','Carbon Road Bike','Sports','Cycling',2899.99,1250,7.8,'carbon-road-bike,sports,cycling,performance,sporting-goods');
    add_prod('apexride','Bike Computer GPS','Sports','Accessories',249.99,88,0.08,'bike-computer-gps,sports,cycling,performance,sporting-goods');
    add_prod('darkmatter','PracticeStream Capture Card','Training Tech','Video Analysis',349.99,125,28,'training-tech,video-analysis,sporting-goods');
    add_prod('darkmatter','CoachView Curved Display','Training Tech','Displays',279.99,98,0.8,'training-tech,displays,sporting-goods');
    add_prod('goldenharvest','Superfood Trail Mix','Sports Nutrition','Trail Snacks',34.99,12,0.8,'sports-nutrition,trail-snacks,sporting-goods');
    add_prod('goldenharvest','Organic Protein Bars 12pk','Sports Nutrition','Protein',27.99,9,1.2,'sports-nutrition,protein,sporting-goods');
    add_prod('goldenharvest','Endurance Granola Trio','Sports Nutrition','Fuel',19.99,6,0.5,'sports-nutrition,fuel,sporting-goods');
    add_prod('nightowl','Herbal Recovery Blend','Sports Nutrition','Energy',24.99,7,0.34,'sports-nutrition,energy,sporting-goods');
    add_prod('nightowl','Matcha Endurance Starter Kit','Sports Nutrition','Hydration',21.99,7,0.6,'sports-nutrition,hydration,sporting-goods');
    add_prod('clearpath','Joint Support Peptides','Recovery','Recovery',54.99,18,0.1,'recovery,recovery,sporting-goods');
    add_prod('clearpath','Magnesium Recovery Gummies','Recovery','Sleep',89.99,30,0.05,'recovery,sleep,sporting-goods');
    add_prod('steelgrip','Trail Multi-Tool Pro 18-in-1','Outdoor Tools','Multi-tools',49.99,16,0.25,'outdoor-tools,multi-tools,sporting-goods');
    add_prod('steelgrip','Bike Shop Impact Driver 20V','Outdoor Tools','Maintenance',179.99,62,1.8,'outdoor-tools,maintenance,sporting-goods');
    add_prod('lunawear','Urban Trail Daypack','Athletic Apparel','Packs',48.99,14,0.01,'athletic-apparel,packs,sporting-goods');
    add_prod('lunawear','StormRunner Trail Shell','Athletic Apparel','Outerwear',79.99,28,0.4,'athletic-apparel,outerwear,sporting-goods');
    add_prod('rapidcharge','TrailRun Sport Earbuds','Sports Tech','Sport Audio',59.99,18,0.15,'sports-tech,sport-audio,sporting-goods');
    add_prod('rapidcharge','RaceDay Docking Hub','Sports Tech','GPS Accessories',44.99,14,0.2,'sports-tech,gps-accessories,sporting-goods');
    add_prod('verdelife','Trailhead Gear Clock','Outdoor Lifestyle','Storage',18.99,5,0.12,'outdoor-lifestyle,storage,sporting-goods');
    add_prod('verdelife','Locker Room Organizer Set','Outdoor Lifestyle','Training Setup',89.99,32,3.5,'outdoor-lifestyle,training-setup,sporting-goods');
    add_prod('coralreef','Sport Wrap Polarized Shades','Sport Eyewear','Running',79.99,24,0.035,'sport-eyewear,running,sporting-goods');
    add_prod('coralreef','Recovery Cooling Gel','Outdoor Care','Recovery',24.99,7,0.12,'outdoor-care,recovery,sporting-goods');
    add_prod('bytebite','Smart Grill Thermometer','Camp Cooking','Food Prep',69.99,24,0.5,'camp-cooking,food-prep,sporting-goods');
    add_prod('bytebite','Camp Chef Knife Set','Camp Cooking','Cutlery',29.99,9,1.2,'camp-cooking,cutlery,sporting-goods');
    -- Reach 150+ unique products

    -- Additional variety
    add_prod('urbanpulse','Urban Trail Daypack','Athletic Apparel','Packs',94.99,34,0.65,'athletic-apparel,packs,sporting-goods');
    add_prod('technova','FieldCoach Training Tablet','Sports Tech','Training Tablets',399.99,155,0.15,'sports-tech,training-tablets,sporting-goods');
    add_prod('glowkin','Recovery Cooling Gel','Outdoor Care','Recovery',48.99,13,0.1,'outdoor-care,recovery,sporting-goods');
    add_prod('peakform','Smart Jump Rope','Fitness','Accessories',39.99,12,0.3,'smart-jump-rope,fitness,training,sporting-goods');
    add_prod('sonicwave','GameDay Soundbar','Training Audio','Stadium Audio',399.99,145,8,'training-audio,stadium-audio,sporting-goods');
    add_prod('trailblaze','Solar Lantern Collapsible','Outdoor','Lighting',29.99,8,0.2,'solar-lantern-collapsible,outdoor,trail,hiking,sporting-goods');
    add_prod('cloudstep','Barefoot Minimalist Shoe','Footwear','Minimalist',99.99,35,0.2,'barefoot-minimalist-shoe,footwear,trail,running,sporting-goods');
    add_prod('pixelcraft','Recovery Command Chair','Training Tech','Recovery Seating',39.99,12,0.6,'training-tech,recovery-seating,sporting-goods');
    add_prod('omniwear','OmniBand Fitness Pro','Sports Wearables','Bands',499.99,180,0.055,'sports-wearables,bands,sporting-goods');
    add_prod('aquafit','Resistance Pool Bands','Fitness','Pool',44.99,14,0.8,'resistance-pool-bands,fitness,training,sporting-goods');
    add_prod('stridepro','Recovery Slide Foam','Footwear','Recovery',64.99,22,0.35,'recovery-slide-foam,footwear,trail,running,sporting-goods');
    add_prod('novaskin','TrailGuard Anti-Chafe Balm','Outdoor Care','Trail Care',26.99,7,0.08,'outdoor-care,trail-care,sporting-goods');
    add_prod('rustichome','Stadium Travel Blanket','Outdoor Lifestyle','Travel Comfort',89.99,30,3.5,'outdoor-lifestyle,travel-comfort,sporting-goods');

    FOR i IN 1..v_prods.COUNT LOOP
        BEGIN
            SELECT brand_id INTO v_brand_id
            FROM brands
            WHERE brand_slug = v_prods(i).bslug;

            v_idx := v_idx + 1;
            v_sku := UPPER(SUBSTR(v_prods(i).bslug, 1, 3)) || '-' ||
                     LPAD(v_idx, 5, '0');

            INSERT INTO products (brand_id, sku, product_name, category, subcategory,
                                  unit_price, unit_cost, weight_kg, tags, launch_date)
            VALUES (v_brand_id, v_sku, v_prods(i).pname, v_prods(i).cat, v_prods(i).subcat,
                    v_prods(i).price, v_prods(i).cost, v_prods(i).wt, v_prods(i).tags,
                    SYSDATE - DBMS_RANDOM.VALUE(30, 730));
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN NULL;  -- skip dupes
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Products loaded: ' || v_idx);
END;
/

-- ============================================================
-- GENERATE INVENTORY (each product stocked at 5-15 random centers)
-- ============================================================
PROMPT Generating inventory...

DECLARE
    v_count       NUMBER := 0;
    v_num_centers NUMBER;
BEGIN
    FOR p IN (SELECT product_id FROM products) LOOP
        v_num_centers := FLOOR(DBMS_RANDOM.VALUE(5, 16));
        FOR c IN (
            SELECT center_id FROM (
                SELECT center_id FROM fulfillment_centers
                ORDER BY DBMS_RANDOM.VALUE
            ) WHERE ROWNUM <= v_num_centers
        ) LOOP
            BEGIN
                INSERT INTO inventory (product_id, center_id, quantity_on_hand,
                                       quantity_reserved, reorder_point, reorder_qty,
                                       last_restock_date)
                VALUES (p.product_id, c.center_id,
                        FLOOR(DBMS_RANDOM.VALUE(10, 500)),
                        FLOOR(DBMS_RANDOM.VALUE(0, 30)),
                        FLOOR(DBMS_RANDOM.VALUE(20, 100)),
                        FLOOR(DBMS_RANDOM.VALUE(100, 500)),
                        SYSDATE - DBMS_RANDOM.VALUE(1, 30));
                v_count := v_count + 1;
            EXCEPTION
                WHEN DUP_VAL_ON_INDEX THEN NULL;
            END;
        END LOOP;
    END LOOP;
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Inventory records loaded: ' || v_count);
END;
/
