require('dotenv').config();
const express = require('express');
const app = express();
const helmet = require('helmet');
app.use(helmet());
const mongoose = require('mongoose');
const ejs = require('ejs');
const _ = require('lodash');

const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");



app.set("view engine", "ejs");
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({
    extended: true
}));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(process.env.MONGODB_SERVER, {
    useUnifiedTopology: true,
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false
});
const medicationSchema = new mongoose.Schema({
    medID: String,
    name: String,
    timesPer: String,
    doseType: String,
    medType: String,

    operation: String,
    currentlyUsing: Boolean

});
const medicationUsageSchema = new mongoose.Schema({
    medication: medicationSchema,
    frequency: {
        times: Number,
        timesPer: String
    },
    form: String,
    quantity: {
        amount: Number,
        unit: String
    },
    currentlyUsing: Boolean
});
const attackSchema = new mongoose.Schema({
    start: Date,
    end: Date,
    intensity: Number,
    medicationUsed: [medicationUsageSchema],
    userId: String
});

const userSchema = new mongoose.Schema({
    firstName: String,
    familyName: String,
    email: String,
    password: String,
    googleId: String,
    facebookId: String,
    secret: String,
    picture: Array,
    admin: {
        type: Boolean,
        default: false
    },
    //ATM the attacks are saved and withdrawn from the Attacks entity and not through User. 
    // It is more efficient to go through user but for now we leave it as is 
    // until there is more time to switch it around. 
    // Preferably at version 2.0
    attacks: [attackSchema]
});
const messageReplySchema = new mongoose.Schema({
    title: String,
    message: String,
    user: String,
    publicationDate: Date
});
const homeMessageSchema = new mongoose.Schema({
    title: String,
    message: String,
    publicationDate: Date,
    user: String,
    replies: [messageReplySchema]
});


userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const HomeMessage = new mongoose.model("HomeMessage", homeMessageSchema);
const MessageReply = new mongoose.model("MessageReply", messageReplySchema);
const User = new mongoose.model("User", userSchema);
const Attack = new mongoose.model('Attack', attackSchema);
const Medication = new mongoose.model('Medication', medicationSchema);
const MedicationUsage = new mongoose.model('MedicationUsage', medicationUsageSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
    done(null, user.id);
});
passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

passport.use(new GoogleStrategy({
        clientID: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/home",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"

    },
    function (accessToken, refreshToken, profile, cb) {
        const username = profile.id + profile.name.givenName + profile.name.familyName;
        User.findOrCreate({
            googleId: profile.id,
            firstName: profile.name.givenName,
            familyName: profile.name.familyName,
            picture: profile.photos,
            username: username
        }, function (err, user) {
            return cb(err, user);
        });
    }
));





app.get("/auth/google",
    passport.authenticate('google', {
        scope: ["profile"]
    })
);

app.get("/auth/google/home",
    passport.authenticate('google', {
        failureRedirect: "/login"
    }),
    function (req, res) {
        // Successful authentication, redirect to secrets.
        res.redirect("/");
    });

app.get("/login", function (req, res) {
    res.render("login");
});

app.get("/register", function (req, res) {
    res.render("register");
});

app.get('/', (req, res) => {


    const getMessages = HomeMessage.find({});
    getMessages.then((result)=>{
        if (req.user) {
            const user = req.user;
            res.render('home', {
                messagesEjs: result,
                userEjs: user
            });
        } else {
            res.redirect("/login");
        }
    }).catch((error)=>{
        console.log(error);
    });
});
        


// Attack Registration Routes
app.get('/attack', (req, res) => {
    if (req.user != null) {
        const user = req.user;
        let attackButton = 'Start';
        res.render('attack', {
            attackButtonEjs: attackButton,
            attackMomentEjs: '',
            displayStyleEjs: "none",
            activeMedsEjs: [""],
            preventiveMedsEjs: [""],
            userEjs: user,
            status: "opened"
        });


    } else {
        res.redirect("/login");
    }
});

app.post('/attackStart', (req, res) => {
    let attackButton = "End";
    let userId = req.user.googleId;
    let now = Date();
    let attackMoment = now;
    const attack = new Attack({
        start: attackMoment,
        userId: userId
    });
    attack.save();
    res.render('attack', {
        attackButtonEjs: attackButton,
        attackMomentEjs: attackMoment,
        displayStyleEjs: "none",
        activeMedsEjs: [""],
        preventiveMedsEjs: [""],
        status: "started"
    });
});

app.post('/attackEnd', (req, res) => {
    let attackButton = "hidden";
    let attackMoment = req.body.attackStartMoment;
    const attackTimerData = req.body.timer;
    const findAndUpdateAttackEnd = Attack.findOneAndUpdate({
            start: attackMoment
        }, {
            $set: {
                end: Date()
            }
        }, {
            new: true
        });
    const medicationFindActive = Medication.find({
        operation: 'active'
    });
    const medicationFindPreventive = Medication.find({
        operation: 'preventive'
    });
    medicationFindPreventive.then((medsprev)=>{
        medicationFindActive.then((meds)=>{
            findAndUpdateAttackEnd.then((attack)=>{
            res.render('attack', {
                attackButtonEjs: attackButton,
                attackMomentEjs: attackMoment,
                displayStyleEjs: "",
                activeMedsEjs: meds,
                preventiveMedsEjs: medsprev,
                status: "ended",
                attackTimerData: attackTimerData
            });
            }).catch((error)=>{
                console.log(error);
            });
        }).catch((error)=>{
            console.log(error);
        });
    }).catch((error)=>{
        console.log(error);
    });
    
});

app.post('/attackInfo', (req, res) => {
    returnDataAsArrayOrString = function (data){
        if (Array.isArray(data)){
            return data[i];
        }else{
            return data;
        }        
    };
    getMedInfo = function (data){
        if (Array.isArray(data)) {
            return data;
        } else {
            return [data];
        }
    }; 
    let attackStartMoment = req.body.attackStartMoment;
    let amount = returnDataAsArrayOrString(req.body.amount);
    let dose = returnDataAsArrayOrString(req.body.dose);
    let usedMedsArray = getMedInfo(req.body.currentlyUsing);
    const findAndUpdateAttackIntensity = Attack.findOneAndUpdate({start: attackStartMoment}, {$set: {intensity: req.body.intensity}}, {new: true});
    findAndUpdateAttackIntensity.then((attack)=>{
        usedMedsArray.forEach(function (currentlyUsing, i){
            const findAttackMedication = Medication.findOne({name: currentlyUsing});
             findAttackMedication.then((foundMed)=>{
                    if (foundMed) {
                        let usingMed = new MedicationUsage({
                            medication: foundMed,
                            frequency: {
                                times: amount,
                                timesPer: foundMed.timesPer
                            },
                            form: foundMed.medType,
                            quantity: {
                                amount: dose,
                                unit: foundMed.doseType
                            },
                            currentlyUsing: true
                        });
                        usingMed.save();
                        const findAndUpdateAttackMedicationUsed = Attack.findOneAndUpdate({start: attackStartMoment}, {$push: {    medicationUsed: usingMed}}, {    new: true});
                        attack.medicationUsed.push(usingMed);
                        findAndUpdateAttackMedicationUsed.catch((error)=>{console.log(error);});
                    }
                }).catch((error)=>{
                    console.log(error);
            });
        });
        function getMedInfo(data){
            if (Array.isArray(data)) {
                return data;
            } else {
                return [data];
            }
        };
        let usedMedsArrayPrev = getMedInfo(req.body.currentlyUsingPrev);
        usedMedsArrayPrev.forEach(function (currentlyUsingPrev, i){ 
            const findAttackMedicationPrev = Medication.findOne({name: currentlyUsingPrev});
            
            findAttackMedicationPrev.then((foundMed)=>{
                if (foundMed) {
                    attack.medicationUsed.push(foundMed);
                    const findAndUpdateAttackMedicationUsedPreventive = Attack.findOneAndUpdate({start: attackStartMoment}, {$push: {    medicationUsed: foundMed}}, {    new: true});
                    findAndUpdateAttackMedicationUsedPreventive.catch((error)=>{
                            console.log(error);
                        });
                }
            }).catch((error)=>{
                console.log(error);
            });
            });
    }).catch((error)=>{
        console.log(error);
    }); 
    res.redirect('/');   
});



// Overview Routes
app.get('/overview', (req, res) => {
    if (req.user != null) {
        user = req.user;
        const date = new Date();
        const month = date.getMonth();
        const year = date.getFullYear();
        User.find({
            googleId: req.user.googleId
        }, (err, foundUser) => {
        Attack.find({userId: req.user.googleId}, (err, attacks) => {                
            res.render('overview', {
                attacksEjs:attacks ,
                monthEjs: month,
                yearEjs: year,
                userEjs: foundUser
            });
        });
        });
    } else {
        res.redirect("/login");
    }
});
app.post('/medicationOverviewSelector', (req, res) => {
    if (req.user != null) {
        user = req.user;
        const month = req.body.month;
        const year = req.body.year;
        const foundUser = User.find({googleId: req.user.googleId});
        const attackList = Attack.find({userId: req.user.googleId});
        foundUser.then(()=>{
        attackList.then((attacks)=>{
        const filteredAttackArray = attacks.filter(function(attack){
            return attack.start.getFullYear() == year && attack.start.getMonth() == month;  
        });           
        res.render('overview', {
            attacksEjs:filteredAttackArray ,
            monthEjs: month,
            yearEjs: year,
            userEjs: foundUser
        });
        }).catch((error)=>{
            console.log(error);
        });
        }).catch((error)=>{
            console.log(error);
        });
    } else {
        res.redirect("/login");
    }
});

// Medication Routes
app.get('/medication', (req, res) => {
    if (req.user != null) {
        const user = req.user;


        res.render('medication', {
            userEjs: user
        });
    } else {
        res.redirect("/login");
    }
});

app.get('/medicationOverview', (req, res) => {
    if (req.user != null) {
        const user = req.user;

        MedicationUsage.find({
            'medication.operation': "active"
        }, (err, medsActive) => {
            MedicationUsage.find({
                'medication.operation': "preventive"
            }, (err, medsPreventive) => {
                res.render('medicationOverview', {
                    medicationActiveEjs: medsActive,
                    medicationPreventiveEjs: medsPreventive,
                    userEjs: user
                });
            });
        });
    } else {
        res.redirect("/login");
    }
});

app.get('/registerMedication', (req, res) => {
    if (req.user != null) {
        const user = req.user;

        Medication.find({
            operation: "preventive",
            currentlyUsing: false
        }, function (err, meds) {
            if (err) {
                console.log(err);
            } else {
                MedicationUsage.find({
                    'medication.currentlyUsing': true
                }, function (err, medsUsing) {
                    if (err) {
                        console.log(err)
                    } else {
                        res.render('registerMedication', {
                            medicationEjs: meds,
                            medicationUsingEjs: medsUsing,
                            userEjs: user
                        });
                    }
                });
            }
        });
    } else {
        res.redirect("/login");
    }
});

app.post('/registerMedication', (req, res) => {

    const name = req.body.name;
    Medication.findOne({
        name: name
    }, (err, medication) => {


        const times = req.body.amount;
        const timesPer = req.body.timesPer;
        const form = req.body.form;
        const amount = req.body.dose;
        const unit = req.body.doseType;
        if (req.body.currentlyUsing === 'on') {
            medication.currentlyUsing = true;
            medication.save();
            const currentlyUsing = true;
            const medicationUsage = new MedicationUsage({
                medication: medication,
                frequency: {
                    times: times,
                    timesPer: timesPer,
                },
                form: form,
                quantity: {
                    amount: amount,
                    unit: unit
                },
                currentlyUsing: currentlyUsing
            });
            medicationUsage.save();
            res.redirect('/registerMedication');


        }
    });
});

app.get('/manageMedication', (req, res) => {
    if (req.user != null) {
        const user = req.user;

        Medication.find({}, function (err, meds) {
            res.render('manageMedication', {
                medicationEjs: meds,
                userEjs: user
            });
        });
    } else {
        res.redirect("/login");
    }
});

app.post('/addNewMedication', (req, res) => {
    const name = req.body.name;
    const timesPer = req.body.timesPer;
    const doseType = req.body.doseType;
    const medType = req.body.medType;
    const operation = req.body.operation;
    const randomNum = Math.floor(Math.random() * 9999999);
    const ID = name + randomNum;
    const medication = new Medication({

        medID: ID,
        name: name,
        timesPer: timesPer,
        doseType: doseType,
        medType: medType,
        operation: operation,
        currentlyUsing: false
    });
    medication.save();
    res.redirect('/registerMedication');
});

app.post('/deleteMedication', (req, res) => {

    Medication.deleteOne({
        name: req.body.medicationName
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            res.redirect('/manageMedication');
        }
    });

});

app.post('/stopMedsUsage', (req, res) => {
    const name = req.body.name;
    MedicationUsage.deleteOne({
        'medication.name': name
    }, (err) => {
        if (err) {
            console.log(err);
        } else {
            res.redirect('/registerMedication');
        }
    });
});

app.post('/messagePost', (req, res) => {
    const user = `${req.user.firstName} ${req.user.familyName}`;
    const message = req.body.message;
    const title = req.body.title;
    const date = new Date();

    const newMessage = new HomeMessage({
        title,
        message,
        user,
        publicationDate: date
    });
    newMessage.save();
    res.redirect('/');

});

app.post('/replyPost', (req, res) => {
    const message = req.body.message;
    const title = req.body.title;
    const date = new Date();
    const id = req.body.id;
    const user = `${req.user.firstName} ${req.user.familyName}`;

    const newReply = new MessageReply({
        title,
        message,
        user,
        publicationDate: date

    });
    newReply.save();
    HomeMessage.findOneAndUpdate({
        _id: id
    }, {
        $push: {
            replies: newReply
        }
    }, {
        new: true
    }, (err) => {
        if (err) {
            console.log(err);
        }

    });

    res.redirect('/');

});

app.listen(3000, () => {
    console.log("server started on port 3000");
});