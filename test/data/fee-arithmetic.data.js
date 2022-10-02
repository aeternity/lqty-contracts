module.exports = {
    secondsToMinutesRoundedDown: [
        [ 0, 0 ],
        [ 1, 0 ],
        [ 3, 0 ],
        [ 37, 0 ],
        [ 432, 7 ],
        [ 1179, 19 ],
        [ 2343, 39 ],
        [ 3598, 59 ],
        [ 3600, 60 ],
        [ 10000, 166 ],
        [ 15000, 250 ],
        [ 17900, 298 ],
        [ 18000, 300 ],
        [ 61328, 1022 ],
        [ 65932, 1098 ],
        [ 79420, 1323 ],
        [ 86147, 1435 ],
        [ 86400, 1440 ],
        [ 35405, 590 ],
        [ 100000, 1666 ],
        [ 604342, 10072 ],
        [ 604800, 10080 ],
        [ 1092099, 18201 ],
        [ 2591349, 43189 ],
        [ 2592000, 43200 ],
        [ 5940183, 99003 ],
        [ 8102940, 135049 ],
        [ 31535342, 525589 ],
        [ 31536000, 525600 ],
        [ 56809809, 946830 ],
        [ 315360000, 5256000 ],
        [ 793450405, 13224173 ],
        [ 1098098098, 18301634 ],
        [ 3153600000, 52560000 ],
        [ 4098977899, 68316298 ],
        [ 9999999999, 166666666 ],
        [ 31535999000, 525599983 ],
        [ 31536000000, 525600000 ],
        [ 50309080980, 838484683 ],
    ],

    /* Object holds arrays for seconds passed, and the corresponding expected decayed base rate, given an initial
  base rate */

    decayBaseRateResults: {
        'seconds': [
            0,
            1,
            3,
            37,
            432,
            1179,
            2343,
            3547,
            3600,	 // 1 hour
            10000,
            15000,
            17900,
            18000,	  // 5 hours
            61328,
            65932,
            79420,
            86147,
            86400,	  // 1 day
            35405,
            100000,
            604342,
            604800,	  // 1 week
            1092099,
            2591349,
            2592000,	  // 1 month
            5940183,
            8102940,
            31535342,
            31536000, // 1 year
            56809809,
            315360000,	  // 10 years
            793450405,
            1098098098,
            3153600000,	  // 100 years
            4098977899,
            9999999999,
            31535999000,
            31536000000,	 // 1000 years
            50309080980,
        ],
        '0.01': [
            10000000000000000,
            10000000000000000,
            10000000000000000,
            10000000000000000,
            9932837247526310,
            9818748881063180,
            9631506200700280,
            9447834221836550,
            9438743126816710,
            8523066208268240,
            7860961982890640,
            7505973548021970,
            7491535384382500,
            3738562496681640,
            3474795549604300,
            2798062319068760,
            2512062814236710,
            2499999999998550,
            5666601111155830,
            2011175814816220,
            615070415779,
            610351562497,
            245591068,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ],
        '0.1': [
            100000000000000000,
            100000000000000000,
            100000000000000000,
            100000000000000000,
            99328372475263100,
            98187488810631800,
            96315062007002900,
            94478342218365500,
            94387431268167100,
            85230662082682400,
            78609619828906400,
            75059735480219700,
            74915353843825000,
            37385624966816400,
            34747955496043000,
            27980623190687600,
            25120628142367100,
            24999999999985500,
            56666011111558300,
            20111758148162200,
            6150704157794,
            6103515624975,
            2455910681,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ],
        '0.34539284': [
            345392840000000000,
            345392840000000000,
            345392840000000000,
            345392840000000000,
            343073086618089000,
            339132556127723000,
            332665328013748000,
            326321429372932000,
            326007429460170000,
            294380604318180000,
            271511998440263000,
            259250952071618000,
            258752268237236000,
            129127271824636000,
            120016950329719000,
            96643069088014400,
            86764850966761100,
            86348209999949800,
            195720345092927000,
            69464572641868900,
            21244091770604,
            21081105956945,
            8482539649,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ],
        '0.9976': [
            997600000000000000,
            997600000000000000,
            997600000000000000,
            997600000000000000,
            990899843813224000,
            979518388374863000,
            960839058581860000,
            942515941970414000,
            941609014331235000,
            850261084936840000,
            784209567413171000,
            748795921150671000,
            747355569945998000,
            372958994668961000,
            346645604028525000,
            279134696950299000,
            250603386348255000,
            249399999999855000,
            565300126848906000,
            200634899286066000,
            61359424678158,
            60888671874752,
            24500164955,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    },

    // Exponent in range [2, 300]
    exponentiationResults: [
        [ 187706062567632000, 17, 445791 ],
        [ 549137589365708000, 2, 301552092054380000 ],
        [ 14163921244333700, 3, 2841518643583 ],
        [ 173482812472018000, 2, 30096286223201300 ],
        [ 89043101634399300, 2, 7928673948673970 ],
        [ 228676956496486000, 2, 52293150432495800 ],
        [ 690422882634616000, 8, 51632293155573900 ],
        [ 88730376626724100, 11, 2684081 ],
        [ 73384846339964600, 5, 2128295594269 ],
        [ 332854710158557000, 10, 16693487237081 ],
        [ 543415023125456000, 24, 439702946262 ],
        [ 289299391854347000, 2, 83694138127294900 ],
        [ 356290645277924000, 2, 126943023912560000 ],
        [ 477806998132950000, 8, 2716564683301040 ],
        [ 410750871076822000, 6, 4802539645325750 ],
        [ 475222270242414000, 4, 51001992001158600 ],
        [ 121455252120304000, 22, 0 ],
        [ 9639247474367520, 4, 8633214298 ],
        [ 637853277178133000, 2, 406856803206885000 ],
        [ 484746955319000000, 6, 12974497294315000 ],
        [ 370594630844984000, 14, 921696040698 ],
        [ 289829200819417000, 12, 351322263034 ],
        [ 229325825269870000, 8, 7649335694527 ],
        [ 265776787719080000, 12, 124223733254 ],
        [ 461409786304156000, 27, 851811777 ],
        [ 240236841088914000, 11, 153828106713 ],
        [ 23036079879643700, 2, 530660976221324 ],
        [ 861616242485528000, 97, 531430041443 ],
        [ 72241661275119400, 212, 0 ],
        [ 924071964863292000, 17, 261215237312535000 ],
        [ 977575971186712000, 19, 649919912701292000 ],
        [ 904200910071210000, 15, 220787304397256000 ],
        [ 858551742150349000, 143, 337758087 ],
        [ 581850663606974000, 68, 102 ],
        [ 354836074035232000, 16, 63160309272 ],
        [ 968639062260900000, 37, 307604877091227000 ],
        [ 784478611520428000, 140, 1743 ],
        [ 61314555619941600, 13, 173 ],
        [ 562295998606858000, 71, 2 ],
        [ 896709855620154000, 20, 112989701464696000 ],
        [ 8484527608110470, 111, 0 ],
        [ 33987471529490900, 190, 0 ],
        [ 109333102690035000, 59, 0 ],
        [ 352436592744656000, 4, 15428509626763400 ],
        [ 940730690913636000, 111, 1134095778412580 ],
        [ 665800835711181000, 87, 428 ],
        [ 365267526644046000, 208, 0 ],
        [ 432669515365048000, 171, 0 ],
        [ 457498365370101000, 40, 26036 ],
        [ 487046034636363000, 12, 178172281758289 ],
        [ 919877008002166000, 85, 826094891277916 ],
    ],
}
