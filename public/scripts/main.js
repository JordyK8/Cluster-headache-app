$(document).ready(){
    $(#startAttack).show();
    $(#endAttack).hide();
}
$(#startAttack).click(function(){
    $(#startAttack).hide();
    $(#endAttack).show();
});

console.log("maijn.js working");
