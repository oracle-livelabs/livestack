/*
 * load_products.sql
 * Media content assets, campaign placements, rights inventory, and production packages
 * Uses PL/SQL to generate volume with variety
 */

SET SERVEROUTPUT ON
PROMPT Loading media content assets and rights inventory...

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
    -- Studios, labels, campaign packages, rights windows, and distribution inventory
    add_prod('aurora','Midnight Harbor Premiere Window','Film','Premium VOD',24.99,8.50,0.001,'film,premiere,pvod,drama,midnight-harbor');
    add_prod('aurora','Behind-the-Scenes Creator Clip Pack','Marketing Assets','Short Form',18000,6400,0.001,'clips,creator,marketing,bts');
    add_prod('aurora','Red Carpet Livestream Sponsorship','Live Event','Sponsorship',125000,42000,0.001,'livestream,red-carpet,sponsor,event');
    add_prod('streamwave','Binge Night Featured Carousel','Streaming Placement','Homepage',65000,21000,0.001,'streaming,homepage,placement,binge');
    add_prod('streamwave','FAST Channel Ad Pod Bundle','Ad Inventory','FAST',32000,9800,0.001,'fast,ad-pod,inventory,programmatic');
    add_prod('streamwave','Series Finale Push Notification','Audience Activation','CRM',14500,3600,0.001,'push,crm,series-finale,retention');
    add_prod('cinepulse','Opening Weekend Theater Boost','Theatrical','Promotion',88000,30000,0.001,'theatrical,opening-weekend,trailers');
    add_prod('cinepulse','Trailer Remix Creator Challenge','Marketing Assets','Creator Campaign',56000,18500,0.001,'trailer,remix,creator,tiktok');
    add_prod('cinepulse','Regional Press Screening Slot','Screening','Press',12000,4100,0.001,'press,screening,regional,reviewers');
    add_prod('soundstage','Concert Livestream Ticket','Live Music','Streaming',18.99,6.20,0.001,'concert,livestream,music,ticket');
    add_prod('soundstage','Artist Meet-and-Greet Package','Fan Experience','VIP',225,78,0.001,'artist,vip,meet-greet,fan');
    add_prod('soundstage','Festival Social Amplification','Marketing Assets','Social',42000,15000,0.001,'festival,social,amplification,music');
    add_prod('marquee','Sports Media Finals Watch Party','Streaming and Live Entertainment','Live Event',36000,12000,0.001,'sports-media,watch-party,finals,entertainment');
    add_prod('marquee','Series Trailer Premiere Takeover','Streaming and Live Entertainment','Launch',94000,31000,0.001,'series,trailer,premiere,takeover');
    add_prod('marquee','Creator Early Access Kit','Creator Campaign','Influencer',22000,7600,0.001,'creator,early-access,creator,entertainment');
    add_prod('neonkids','Family Animation Premiere','Kids and Family','Streaming',19.99,6.75,0.001,'animation,family,premiere,kids');
    add_prod('neonkids','Back-to-School Character Shorts','Short Form','Kids',28000,8700,0.001,'shorts,kids,back-to-school,characters');
    add_prod('sportscast','Championship Highlights Rights','Sports Rights','Highlights',175000,64000,0.001,'sports,highlights,rights,championship');
    add_prod('docuworld','True Crime Docuseries Launch','Documentary','Series Launch',48000,16500,0.001,'documentary,true-crime,series,launch');
    add_prod('kdramahub','K-Drama Season Release Campaign','International Streaming','Drama',52000,17800,0.001,'k-drama,season-release,international,fandom');
    add_prod('indieframe','Festival Jury Screening Kit','Independent Film','Festival',15000,5200,0.001,'indie,festival,screening,jury');
    add_prod('animeforge','Anime Premiere Watch Party','Animation','Fandom',44000,15200,0.001,'anime,premiere,watch-party,fandom');
    add_prod('latinstream','Telenovela Finale Audience Push','Spanish-Language Media','Drama',37000,12200,0.001,'telenovela,finale,audience,latam');
    add_prod('marquee','Sports Docuseries Season Access Bundle','Streaming and Live Entertainment','Season Access',49000,17100,0.001,'series,season-access,premium,ltv');
    add_prod('marquee','Audience Rewards Calendar','Streaming and Live Entertainment','Live Event Operations',26500,9100,0.001,'live-events,rewards,journeys,retention');
    add_prod('marquee','Subscriber Churn Winback Offer','Streaming and Live Entertainment','Retention',18500,6200,0.001,'churn,winback,retention,subscriber');
    add_prod('marquee','Premium Storefront Creator Bundle','Streaming and Live Entertainment','Premium Purchase',74000,24000,0.001,'premium,creator-release,store,arpu');
    add_prod('marquee','Superfan Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',42000,14200,0.001,'loyalty-bonus,superfan,progression,monetization');
    add_prod('marquee','Creator Premiere Event Content Releases','Streaming and Live Entertainment','Creator Campaign',56000,18800,0.001,'creator,content releases,premiere event,creator');
    add_prod('streamwave','Subscription Save Offer','Audience Activation','Subscription',22000,7200,0.001,'subscription,churn,save-offer,retention');
    add_prod('streamwave','Watch Time Booster Experiment','Streaming Placement','Personalization',34000,11200,0.001,'watch-time,recommendation,personalization,engagement');
    add_prod('streamwave','Lapsed Viewer Winback Carousel','Audience Activation','Retention',26000,8700,0.001,'lapsed-viewer,winback,carousel,retention');
    add_prod('streamwave','Premium Bundle Upsell Test','Audience Activation','Subscription',38000,13000,0.001,'subscription,upsell,bundle,arpu');
    add_prod('aurora','Midnight Harbor Deleted Scenes Release','Film','Bonus Content',28000,9400,0.001,'midnight-harbor,bonus-content,fan,engagement');
    add_prod('aurora','Trust and Safety Moderation Burst','Trust and Safety','Moderation',24000,8200,0.001,'trust-safety,moderation,premiere,fan');
    add_prod('cinepulse','Creator Release Sponsored Journey','Creator Campaign','Sponsored Journey',61000,21000,0.001,'creator,sponsored-journey,acquisition,campaign');
    add_prod('cinepulse','Dynamic Trailer A/B Test','Marketing Assets','Creative Testing',33000,11800,0.001,'trailer,ab-test,creative,conversion');
    add_prod('soundstage','ARPU Lift Offer Test','Fan Experience','Monetization',31000,10500,0.001,'arpu,offer-test,vip,monetization');
    add_prod('soundstage','Superfan Loyalty Encore Pack','Fan Experience','Loyalty',27000,9400,0.001,'loyalty,superfan,encore,retention');
    add_prod('neonkids','Safe Kids Moderation Pack','Trust and Safety','Moderation',18000,6400,0.001,'moderation,safety,kids,community');
    add_prod('sportscast','Regional Sports Rights Flash Sale','Sports Rights','Regional Package',96000,36000,0.001,'sports,rights,regional,monetization');
    add_prod('docuworld','Subscriber Debate Live Forum','Documentary','Community Event',22000,7600,0.001,'documentary,forum,community,subscriber');
    add_prod('kdramahub','International Fandom Watch Party','International Streaming','Watch Party',39000,13200,0.001,'international,fandom,watch-party,subtitles');
    add_prod('animeforge','Cosplay Creator Premiere Release','Animation','Creator Campaign',36000,12400,0.001,'anime,cosplay,creator,premiere');
    add_prod('latinstream','Localized Finale Clip Pack','Spanish-Language Media','Localization',29000,9800,0.001,'localization,finale,clips,latam');
    add_prod('indieframe','Streaming Launch Founder Pack','Streaming and Live Entertainment','Launch Bundle',69000,23000,0.001,'premiere,founder-pack,launch,subscriber');
    add_prod('soundstage','Neon Rift Premiere Window','Film','Premium VOD',29.99,9.50,0.001,'film,premiere,pvod,audience');
    add_prod('animeforge','Final Whistle Live Creator Clip Flight','Marketing Assets','Short Form',25750,8220,0.001,'creator,clips,conversion,fan');
    add_prod('aurora','Dreamline Academy Watch Party Kit','Live Event','Watch Party',39500,13440,0.001,'watch-party,fan,community,event');
    add_prod('streamwave','Signal Run FAST Channel Breakout Package','Ad Inventory','FAST',44250,14660,0.001,'fast,ad-inventory,programmatic,regional_ad_demand');
    add_prod('cinepulse','Prime Pitch Season Access Expansion','Streaming and Live Entertainment','Season Access',59000,20480,0.001,'series,season-access,subscriber,ltv');
    add_prod('soundstage','Sonic City Sessions Live Event Reminder Journey','Streaming and Live Entertainment','Live Event Operations',39750,13500,0.001,'live-events,journey,retention,subscriber');
    add_prod('marquee','WideAngle Matchday Premium Purchase Offer','Streaming and Live Entertainment','Premium Purchase',57500,19320,0.001,'premium,purchase,arpu,monetization');
    add_prod('cinepulse','RidgeLine Trails Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',56250,14900,0.001,'loyalty-bonus,progression,engagement,retention');
    add_prod('indieframe','Neon Rift Sports Highlights Rights','Sports Rights','Highlights',169000,57620,0.001,'sports,rights,highlights,sponsor');
    add_prod('docuworld','Final Whistle Live Regional Rights Window','Sports Rights','Regional Package',118000,43240,0.001,'regional-rights,sports,capacity,monetization');
    add_prod('kdramahub','Dreamline Academy Subscriber Save Journey','Audience Activation','Retention',27750,10660,0.001,'subscriber,churn,retention,winback');
    add_prod('indieframe','Signal Run Watch Time Personalization Test','Streaming Placement','Personalization',37500,13680,0.001,'watch-time,recommendation,engagement,subscriber');
    add_prod('animeforge','Prime Pitch Premium Bundle Upsell','Audience Activation','Subscription',44250,16300,0.001,'subscription,upsell,arpu,bundle');
    add_prod('latinstream','Sonic City Sessions Moderation Surge Pack','Trust and Safety','Moderation',28000,10920,0.001,'moderation,trust-safety,fan,community');
    add_prod('streamwave','WideAngle Matchday Creator Sponsored Journey','Creator Campaign','Sponsored Journey',70750,21400,0.001,'creator,sponsored-journey,campaign,acquisition');
    add_prod('kdramahub','RidgeLine Trails Trailer A/B Conversion Test','Marketing Assets','Creative Testing',43500,12420,0.001,'trailer,ab-test,conversion,marketing');
    add_prod('cinepulse','Neon Rift International Subtitle Release','International Streaming','Localization',40250,10840,0.001,'international,subtitles,localization,fandom');
    add_prod('soundstage','Final Whistle Live Superfan Loyalty Pack','Fan Experience','Loyalty',41000,11260,0.001,'loyalty,superfan,retention,fan');
    add_prod('marquee','Dreamline Academy Documentary Forum Event','Documentary','Community Event',22000,10080,0.001,'documentary,forum,subscriber,community');
    add_prod('neonkids','Signal Run Kids Safety Chat Coverage','Kids and Family','Safety',20750,9600,0.001,'kids,safety,moderation,family');
    add_prod('sportscast','The Last Laugh Track Premiere Window','Film','Premium VOD',3529.99,3729.50,0.001,'film,premiere,pvod,audience');
    add_prod('aurora','Forge Comics Live Creator Clip Flight','Marketing Assets','Short Form',29250,7600,0.001,'creator,clips,conversion,fan');
    add_prod('docuworld','Global Drama Nights Watch Party Kit','Live Event','Watch Party',43000,12820,0.001,'watch-party,fan,community,event');
    add_prod('indieframe','BrightSide Lab FAST Channel Breakout Package','Ad Inventory','FAST',47750,14040,0.001,'fast,ad-inventory,programmatic,regional_ad_demand');
    add_prod('animeforge','Starlight Champions Season Access Expansion','Streaming and Live Entertainment','Season Access',62500,19860,0.001,'series,season-access,subscriber,ltv');
    add_prod('latinstream','Lunar Kitchen Live Event Reminder Journey','Streaming and Live Entertainment','Live Event Operations',43250,12880,0.001,'live-events,journey,retention,subscriber');
    add_prod('aurora','Retro Journey Premium Purchase Offer','Streaming and Live Entertainment','Premium Purchase',61000,18700,0.001,'premium,purchase,arpu,monetization');
    add_prod('streamwave','Cloudbreak City Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',44000,18620,0.001,'loyalty-bonus,progression,engagement,retention');
    add_prod('cinepulse','The Last Laugh Track Sports Highlights Rights','Sports Rights','Highlights',156750,57000,0.001,'sports,rights,highlights,sponsor');
    add_prod('sportscast','Forge Comics Live Regional Rights Window','Sports Rights','Regional Package',121500,42620,0.001,'regional-rights,sports,capacity,monetization');
    add_prod('marquee','Global Drama Nights Subscriber Save Journey','Audience Activation','Retention',31250,10040,0.001,'subscriber,churn,retention,winback');
    add_prod('neonkids','BrightSide Lab Watch Time Personalization Test','Streaming Placement','Personalization',41000,13060,0.001,'watch-time,recommendation,engagement,subscriber');
    add_prod('sportscast','Starlight Champions Premium Bundle Upsell','Audience Activation','Subscription',47750,15680,0.001,'subscription,upsell,arpu,bundle');
    add_prod('docuworld','Lunar Kitchen Moderation Surge Pack','Trust and Safety','Moderation',31500,10300,0.001,'moderation,trust-safety,fan,community');
    add_prod('kdramahub','Retro Journey Creator Sponsored Journey','Creator Campaign','Sponsored Journey',74250,25120,0.001,'creator,sponsored-journey,campaign,acquisition');
    add_prod('indieframe','Cloudbreak City Trailer A/B Conversion Test','Marketing Assets','Creative Testing',47000,11800,0.001,'trailer,ab-test,conversion,marketing');
    add_prod('neonkids','The Last Laugh Track International Subtitle Release','International Streaming','Localization',28000,10220,0.001,'international,subtitles,localization,fandom');
    add_prod('latinstream','Forge Comics Live Superfan Loyalty Pack','Fan Experience','Loyalty',28750,10640,0.001,'loyalty,superfan,retention,fan');
    add_prod('aurora','Global Drama Nights Documentary Forum Event','Documentary','Community Event',25500,9460,0.001,'documentary,forum,subscriber,community');
    add_prod('streamwave','BrightSide Lab Kids Safety Chat Coverage','Kids and Family','Safety',24250,8980,0.001,'kids,safety,moderation,family');
    add_prod('cinepulse','Shadow Circuit Premiere Window','Film','Premium VOD',7029.99,3109.50,0.001,'film,premiere,pvod,audience');
    add_prod('soundstage','Skyline Detectives Creator Clip Flight','Marketing Assets','Short Form',32750,11320,0.001,'creator,clips,conversion,fan');
    add_prod('marquee','Northstar Derby Watch Party Kit','Live Event','Watch Party',46500,12200,0.001,'watch-party,fan,community,event');
    add_prod('marquee','Echo Valley FAST Channel Breakout Package','Ad Inventory','FAST',51250,13420,0.001,'fast,ad-inventory,programmatic,regional_ad_demand');
    add_prod('latinstream','Journeyline Heroes Season Access Expansion','Streaming and Live Entertainment','Season Access',66000,19240,0.001,'series,season-access,subscriber,ltv');
    add_prod('docuworld','Mosaic Crimes Live Event Reminder Journey','Streaming and Live Entertainment','Live Event Operations',31000,12260,0.001,'live-events,journey,retention,subscriber');
    add_prod('kdramahub','Rocket Stream Premium Purchase Offer','Streaming and Live Entertainment','Premium Purchase',48750,18080,0.001,'premium,purchase,arpu,monetization');
    add_prod('indieframe','Champion Reel Daily Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',47500,18000,0.001,'loyalty-bonus,progression,engagement,retention');
    add_prod('animeforge','Shadow Circuit Sports Highlights Rights','Sports Rights','Highlights',160250,60720,0.001,'sports,rights,highlights,sponsor');
    add_prod('latinstream','Skyline Detectives Regional Rights Window','Sports Rights','Regional Package',125000,42000,0.001,'regional-rights,sports,capacity,monetization');
    add_prod('soundstage','Northstar Derby Subscriber Save Journey','Audience Activation','Retention',34750,9420,0.001,'subscriber,churn,retention,winback');
    add_prod('animeforge','Echo Valley Watch Time Personalization Test','Streaming Placement','Personalization',44500,12440,0.001,'watch-time,recommendation,engagement,subscriber');
    add_prod('cinepulse','Journeyline Heroes Premium Bundle Upsell','Audience Activation','Subscription',51250,15060,0.001,'subscription,upsell,arpu,bundle');
    add_prod('soundstage','Mosaic Crimes Moderation Surge Pack','Trust and Safety','Moderation',35000,9680,0.001,'moderation,trust-safety,fan,community');
    add_prod('marquee','Rocket Stream Creator Sponsored Journey','Creator Campaign','Sponsored Journey',62000,24500,0.001,'creator,sponsored-journey,campaign,acquisition');
    add_prod('neonkids','Champion Reel Daily Trailer A/B Conversion Test','Marketing Assets','Creative Testing',34750,15520,0.001,'trailer,ab-test,conversion,marketing');
    add_prod('sportscast','Shadow Circuit International Subtitle Release','International Streaming','Localization',31500,9600,0.001,'international,subtitles,localization,fandom');
    add_prod('cinepulse','Skyline Detectives Superfan Loyalty Pack','Fan Experience','Loyalty',32250,10020,0.001,'loyalty,superfan,retention,fan');
    add_prod('indieframe','Northstar Derby Documentary Forum Event','Documentary','Community Event',29000,8840,0.001,'documentary,forum,subscriber,community');
    add_prod('indieframe','Echo Valley Kids Safety Chat Coverage','Kids and Family','Safety',27750,8360,0.001,'kids,safety,moderation,family');
    add_prod('animeforge','Nova Kids Journey Creator Clip Flight','Marketing Assets','Short Form',36250,10700,0.001,'creator,clips,conversion,fan');
    add_prod('latinstream','Horizon Family Hour Watch Party Kit','Live Event','Watch Party',50000,15920,0.001,'watch-party,fan,community,event');
    add_prod('aurora','Helix League FAST Channel Breakout Package','Ad Inventory','FAST',39000,12800,0.001,'fast,ad-inventory,programmatic,regional_ad_demand');
    add_prod('streamwave','Crystal Borough Season Access Expansion','Streaming and Live Entertainment','Season Access',53750,18620,0.001,'series,season-access,subscriber,ltv');
    add_prod('kdramahub','Cyber Harbor Live Event Reminder Journey','Streaming and Live Entertainment','Live Event Operations',34500,11640,0.001,'live-events,journey,retention,subscriber');
    add_prod('soundstage','Desert Bloom Premium Purchase Offer','Streaming and Live Entertainment','Premium Purchase',52250,17460,0.001,'premium,purchase,arpu,monetization');
    add_prod('marquee','Ocean Crown Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',51000,17380,0.001,'loyalty-bonus,progression,engagement,retention');
    add_prod('neonkids','Midnight Harbor Sports Highlights Rights','Sports Rights','Highlights',163750,60100,0.001,'sports,rights,highlights,sponsor');
    add_prod('sportscast','Nova Kids Journey Regional Rights Window','Sports Rights','Regional Package',128500,45720,0.001,'regional-rights,sports,capacity,monetization');
    add_prod('docuworld','Horizon Family Hour Subscriber Save Journey','Audience Activation','Retention',38250,8800,0.001,'subscriber,churn,retention,winback');
    add_prod('aurora','Helix League Watch Time Personalization Test','Streaming Placement','Personalization',48000,11820,0.001,'watch-time,recommendation,engagement,subscriber');
    add_prod('docuworld','Crystal Borough Premium Bundle Upsell','Audience Activation','Subscription',39000,14440,0.001,'subscription,upsell,arpu,bundle');
    add_prod('animeforge','Cyber Harbor Moderation Surge Pack','Trust and Safety','Moderation',22750,9060,0.001,'moderation,trust-safety,fan,community');
    add_prod('latinstream','Desert Bloom Creator Sponsored Journey','Creator Campaign','Sponsored Journey',65500,23880,0.001,'creator,sponsored-journey,campaign,acquisition');
    add_prod('aurora','Ocean Crown Trailer A/B Conversion Test','Marketing Assets','Creative Testing',38250,14900,0.001,'trailer,ab-test,conversion,marketing');
    add_prod('streamwave','Midnight Harbor International Subtitle Release','International Streaming','Localization',35000,13320,0.001,'international,subtitles,localization,fandom');
    add_prod('cinepulse','Nova Kids Journey Superfan Loyalty Pack','Fan Experience','Loyalty',35750,9400,0.001,'loyalty,superfan,retention,fan');
    add_prod('soundstage','Horizon Family Hour Documentary Forum Event','Documentary','Community Event',32500,8220,0.001,'documentary,forum,subscriber,community');
    add_prod('sportscast','Helix League Kids Safety Chat Coverage','Kids and Family','Safety',31250,7740,0.001,'kids,safety,moderation,family');
    add_prod('neonkids','Orbit Riders Premiere Window','Film','Premium VOD',14029.99,1869.50,0.001,'film,premiere,pvod,audience');
    add_prod('sportscast','Pulse Arena Creator Clip Flight','Marketing Assets','Short Form',24000,10080,0.001,'creator,clips,conversion,fan');
    add_prod('docuworld','Arcadia Legends Watch Party Kit','Live Event','Watch Party',37750,15300,0.001,'watch-party,fan,community,event');
    add_prod('kdramahub','Beta Realm FAST Channel Breakout Package','Ad Inventory','FAST',42500,16520,0.001,'fast,ad-inventory,programmatic,regional_ad_demand');
    add_prod('indieframe','Atlas Arena Season Access Expansion','Streaming and Live Entertainment','Season Access',57250,18000,0.001,'series,season-access,subscriber,ltv');
    add_prod('animeforge','Cobalt Screens Live Event Reminder Journey','Streaming and Live Entertainment','Live Event Operations',38000,11020,0.001,'live-events,journey,retention,subscriber');
    add_prod('neonkids','Marquee Mystery Premium Purchase Offer','Streaming and Live Entertainment','Premium Purchase',55750,16840,0.001,'premium,purchase,arpu,monetization');
    add_prod('aurora','EchoVerse Originals Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',54500,16760,0.001,'loyalty-bonus,progression,engagement,retention');
    add_prod('streamwave','Orbit Riders Sports Highlights Rights','Sports Rights','Highlights',167250,59480,0.001,'sports,rights,highlights,sponsor');
    add_prod('cinepulse','Pulse Arena Regional Rights Window','Sports Rights','Regional Package',132000,45100,0.001,'regional-rights,sports,capacity,monetization');
    add_prod('soundstage','Arcadia Legends Subscriber Save Journey','Audience Activation','Retention',26000,12520,0.001,'subscriber,churn,retention,winback');
    add_prod('marquee','Beta Realm Watch Time Personalization Test','Streaming Placement','Personalization',35750,11200,0.001,'watch-time,recommendation,engagement,subscriber');
    add_prod('neonkids','Atlas Arena Premium Bundle Upsell','Audience Activation','Subscription',42500,13820,0.001,'subscription,upsell,arpu,bundle');
    add_prod('marquee','Cobalt Screens Moderation Surge Pack','Trust and Safety','Moderation',26250,8440,0.001,'moderation,trust-safety,fan,community');
    add_prod('latinstream','Marquee Mystery Creator Sponsored Journey','Creator Campaign','Sponsored Journey',69000,23260,0.001,'creator,sponsored-journey,campaign,acquisition');
    add_prod('kdramahub','EchoVerse Originals Trailer A/B Conversion Test','Marketing Assets','Creative Testing',41750,14280,0.001,'trailer,ab-test,conversion,marketing');
    add_prod('indieframe','Orbit Riders International Subtitle Release','International Streaming','Localization',38500,12700,0.001,'international,subtitles,localization,fandom');
    add_prod('animeforge','Pulse Arena Superfan Loyalty Pack','Fan Experience','Loyalty',39250,13120,0.001,'loyalty,superfan,retention,fan');
    add_prod('latinstream','Arcadia Legends Documentary Forum Event','Documentary','Community Event',36000,7600,0.001,'documentary,forum,subscriber,community');
    add_prod('aurora','Beta Realm Kids Safety Chat Coverage','Kids and Family','Safety',19000,7120,0.001,'kids,safety,moderation,family');
    add_prod('soundstage','Sonic City Sessions Premiere Window','Film','Premium VOD',1779.99,1249.50,0.001,'film,premiere,pvod,audience');
    add_prod('animeforge','WideAngle Matchday Creator Clip Flight','Marketing Assets','Short Form',27500,9460,0.001,'creator,clips,conversion,fan');
    add_prod('soundstage','RidgeLine Trails Watch Party Kit','Live Event','Watch Party',41250,14680,0.001,'watch-party,fan,community,event');
    add_prod('marquee','Neon Rift FAST Channel Breakout Package','Ad Inventory','FAST',46000,15900,0.001,'fast,ad-inventory,programmatic,regional_ad_demand');
    add_prod('neonkids','Final Whistle Live Season Access Expansion','Streaming and Live Entertainment','Season Access',60750,21720,0.001,'series,season-access,subscriber,ltv');
    add_prod('sportscast','Dreamline Academy Live Event Reminder Journey','Streaming and Live Entertainment','Live Event Operations',41500,10400,0.001,'live-events,journey,retention,subscriber');
    add_prod('docuworld','Signal Run Premium Purchase Offer','Streaming and Live Entertainment','Premium Purchase',59250,16220,0.001,'premium,purchase,arpu,monetization');
    add_prod('cinepulse','Prime Pitch Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',58000,16140,0.001,'loyalty-bonus,progression,engagement,retention');
    add_prod('indieframe','Sonic City Sessions Sports Highlights Rights','Sports Rights','Highlights',155000,58860,0.001,'sports,rights,highlights,sponsor');
    add_prod('animeforge','WideAngle Matchday Regional Rights Window','Sports Rights','Regional Package',119750,44480,0.001,'regional-rights,sports,capacity,monetization');
    add_prod('latinstream','RidgeLine Trails Subscriber Save Journey','Audience Activation','Retention',29500,11900,0.001,'subscriber,churn,retention,winback');
    add_prod('aurora','Neon Rift Watch Time Personalization Test','Streaming Placement','Personalization',39250,14920,0.001,'watch-time,recommendation,engagement,subscriber');
    add_prod('streamwave','Final Whistle Live Premium Bundle Upsell','Audience Activation','Subscription',46000,13200,0.001,'subscription,upsell,arpu,bundle');
    add_prod('cinepulse','Dreamline Academy Moderation Surge Pack','Trust and Safety','Moderation',29750,7820,0.001,'moderation,trust-safety,fan,community');
    add_prod('streamwave','Signal Run Creator Sponsored Journey','Creator Campaign','Sponsored Journey',72500,22640,0.001,'creator,sponsored-journey,campaign,acquisition');
    add_prod('kdramahub','Prime Pitch Trailer A/B Conversion Test','Marketing Assets','Creative Testing',45250,13660,0.001,'trailer,ab-test,conversion,marketing');
    add_prod('neonkids','Sonic City Sessions International Subtitle Release','International Streaming','Localization',42000,12080,0.001,'international,subtitles,localization,fandom');
    add_prod('sportscast','WideAngle Matchday Superfan Loyalty Pack','Fan Experience','Loyalty',27000,12500,0.001,'loyalty,superfan,retention,fan');
    add_prod('docuworld','RidgeLine Trails Documentary Forum Event','Documentary','Community Event',23750,11320,0.001,'documentary,forum,subscriber,community');
    add_prod('kdramahub','Neon Rift Kids Safety Chat Coverage','Kids and Family','Safety',22500,6500,0.001,'kids,safety,moderation,family');
    add_prod('indieframe','Lunar Kitchen Premiere Window','Film','Premium VOD',5279.99,629.50,0.001,'film,premiere,pvod,audience');
    add_prod('aurora','Retro Journey Creator Clip Flight','Marketing Assets','Short Form',31000,8840,0.001,'creator,clips,conversion,fan');
    add_prod('docuworld','Cloudbreak City Watch Party Kit','Live Event','Watch Party',44750,14060,0.001,'watch-party,fan,community,event');
    add_prod('aurora','The Last Laugh Track FAST Channel Breakout Package','Ad Inventory','FAST',49500,15280,0.001,'fast,ad-inventory,programmatic,regional_ad_demand');
    add_prod('streamwave','Forge Comics Live Season Access Expansion','Streaming and Live Entertainment','Season Access',64250,21100,0.001,'series,season-access,subscriber,ltv');
    add_prod('cinepulse','Global Drama Nights Live Event Reminder Journey','Streaming and Live Entertainment','Live Event Operations',45000,14120,0.001,'live-events,journey,retention,subscriber');
    add_prod('soundstage','BrightSide Lab Premium Purchase Offer','Streaming and Live Entertainment','Premium Purchase',47000,15600,0.001,'premium,purchase,arpu,monetization');
    add_prod('marquee','Starlight Champions Loyalty Bonus Content Track','Streaming and Live Entertainment','Loyalty Track',45750,15520,0.001,'loyalty-bonus,progression,engagement,retention');
    add_prod('neonkids','Lunar Kitchen Sports Highlights Rights','Sports Rights','Highlights',158500,58240,0.001,'sports,rights,highlights,sponsor');
    add_prod('sportscast','Retro Journey Regional Rights Window','Sports Rights','Regional Package',123250,43860,0.001,'regional-rights,sports,capacity,monetization');
    add_prod('docuworld','Cloudbreak City Subscriber Save Journey','Audience Activation','Retention',33000,11280,0.001,'subscriber,churn,retention,winback');
    add_prod('kdramahub','The Last Laugh Track Watch Time Personalization Test','Streaming Placement','Personalization',42750,14300,0.001,'watch-time,recommendation,engagement,subscriber');
    add_prod('indieframe','Forge Comics Live Premium Bundle Upsell','Audience Activation','Subscription',49500,16920,0.001,'subscription,upsell,arpu,bundle');
    add_prod('animeforge','Global Drama Nights Moderation Surge Pack','Trust and Safety','Moderation',33250,7200,0.001,'moderation,trust-safety,fan,community');
    add_prod('latinstream','BrightSide Lab Creator Sponsored Journey','Creator Campaign','Sponsored Journey',76000,22020,0.001,'creator,sponsored-journey,campaign,acquisition');
    add_prod('aurora','Starlight Champions Trailer A/B Conversion Test','Marketing Assets','Creative Testing',33000,13040,0.001,'trailer,ab-test,conversion,marketing');
    add_prod('neonkids','Lunar Kitchen International Subtitle Release','International Streaming','Localization',29750,11460,0.001,'international,subtitles,localization,fandom');
    add_prod('cinepulse','Retro Journey Superfan Loyalty Pack','Fan Experience','Loyalty',30500,11880,0.001,'loyalty,superfan,retention,fan');
    add_prod('soundstage','Cloudbreak City Documentary Forum Event','Documentary','Community Event',27250,10700,0.001,'documentary,forum,subscriber,community');
    add_prod('marquee','The Last Laugh Track Kids Safety Chat Coverage','Kids and Family','Safety',26000,10220,0.001,'kids,safety,moderation,family');
    add_prod('neonkids','Mosaic Crimes Premiere Window','Film','Premium VOD',8779.99,9.50,0.001,'film,premiere,pvod,audience');
    add_prod('sportscast','Rocket Stream Creator Clip Flight','Marketing Assets','Short Form',34500,8220,0.001,'creator,clips,conversion,fan');

    FOR i IN 1..v_prods.COUNT LOOP
        BEGIN
            SELECT brand_id INTO v_brand_id
            FROM brands
            WHERE brand_slug = v_prods(i).bslug;

            v_idx := v_idx + 1;
            v_sku := UPPER(SUBSTR(v_prods(i).bslug, 1, 3)) || '-' ||
                     LPAD(v_idx, 5, '0');

            INSERT INTO products (brand_id, sku, product_name, description, category, subcategory,
                                  unit_price, unit_cost, weight_kg, tags, launch_date)
            VALUES (v_brand_id, v_sku, v_prods(i).pname,
                    v_prods(i).pname || ' connects media and entertainment planning to audience momentum, rights capacity, retention, ARPU, watch time, live event operations, and governed campaign decisions.',
                    v_prods(i).cat, v_prods(i).subcat,
                    v_prods(i).price, v_prods(i).cost, v_prods(i).wt, v_prods(i).tags,
                    SYSDATE - DBMS_RANDOM.VALUE(30, 730));
        EXCEPTION
            WHEN DUP_VAL_ON_INDEX THEN NULL;  -- skip dupes
        END;
    END LOOP;

    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Media content asset records loaded: ' || v_idx);
END;
/

-- ============================================================
    -- GENERATE RIGHTS / INVENTORY LEVELS (each asset available at 9-12 distribution hubs)
-- ============================================================
PROMPT Generating rights inventory and campaign capacity levels...

DECLARE
    v_count       NUMBER := 0;
    v_num_centers NUMBER;
BEGIN
    FOR p IN (SELECT product_id FROM products) LOOP
        v_num_centers := FLOOR(DBMS_RANDOM.VALUE(9, 13));
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
    DBMS_OUTPUT.PUT_LINE('Rights inventory records loaded: ' || v_count);
END;
/
