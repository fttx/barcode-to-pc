import { ServerModel } from './../../models/server.model';
import { ScanModel } from './../../models/scan.model';
import { Component } from '@angular/core';
import { NavController, Slides, ViewController, AlertController } from 'ionic-angular';
import { ViewChild, NgZone } from '@angular/core';
import { ScanSessionsPage } from '../scan-sessions/scan-sessions';
import { ServerProvider } from '../../providers/server'
import { Config } from '../../providers/config'
import { Settings } from '../../providers/settings'
import { FirebaseAnalytics } from '@ionic-native/firebase-analytics';
import { BarcodeScanner } from '@fttx/barcode-scanner';
import { wsEvent } from '../../models/ws-event.model';
import { Utils } from '../../providers/utils';
import { Subscription } from 'rxjs';

/*
  Generated class for the Welcome page.

  See http://ionicframework.com/docs/v2/components/#navigation for more info on
  Ionic pages and navigation.
*/
@Component({
  selector: 'page-welcome',
  templateUrl: 'welcome.html'
})
export class WelcomePage {
  @ViewChild('slider') slider: Slides;
  public showNext = true;
  public connecting = true;
  public connected = false;

  private troubleshootingDialogTimeout = null;
  public currentAttemptingServer: ServerModel;
  private onConnectSubscription: Subscription;

  constructor(
    private alertCtrl: AlertController,
    public navCtrl: NavController,
    private serverProvider: ServerProvider,
    public viewCtrl: ViewController,
    private settings: Settings,
    private ngZone: NgZone,
    private firebaseAnalytics: FirebaseAnalytics,
    private barcodeScanner: BarcodeScanner,
    private utils: Utils,
  ) { }

  ionViewDidEnter() {
    this.firebaseAnalytics.setCurrentScreen("WelcomePage");
    this.onConnectSubscription = this.serverProvider.onConnect().subscribe((server) => {
      this.settings.setDefaultServer(server);
      this.slider.slideTo(this.slider.length() - 1);
      this.ngZone.run(() => {
        this.connecting = false;
        this.showNext = false;
      });
      this.connected = true;
      this.serverProvider.stopWatchForServers();
    });

    this.serverProvider.watchForServers().delay(500).subscribe(data => { // delay to prevent this.slide null when the server gets published too fast
      if (data.action == 'added' || data.action == 'resolved') {
        this.attempConnection(data.server)
      }
    });
  }

  ionViewDidLeave() {
    this.serverProvider.stopWatchForServers();
    this.onConnectSubscription.unsubscribe();
    clearTimeout(this.troubleshootingDialogTimeout);
  }

  onSkipClicked() {
    this.firebaseAnalytics.logEvent('welcome', {});

    let alert = this.alertCtrl.create({
      inputs: [
        {
          type: 'checkbox',
          label: 'Do not show anymore',
          value: 'alwaysSkipWelcomePage',
          checked: false
        }
      ],
      buttons: [
        {
          text: 'Skip',
          handler: data => {
            if (data == 'alwaysSkipWelcomePage') {
              this.settings.setAlwaysSkipWelcomePage(true);
            }
            this.navCtrl.setRoot(ScanSessionsPage);
          }
        }
      ]
    });
    alert.present();
  }

  onNextClicked() {
    this.slider.slideNext();
  }

  onScanQRCodeClicked() {
    this.barcodeScanner.scan({
      "showFlipCameraButton": true, // iOS and Android
      formats: "QR_CODE"
    }).subscribe((scan: ScanModel) => {
      if (scan && scan.text) {
        let servers = ServerModel.serversFromJSON(scan.text);
        servers.forEach(server => {
          this.attempConnection(server);
        })
      }
    }, err => { });
  }

  startScanningClicked() {
    this.firebaseAnalytics.logEvent('welcome', {});
    this.navCtrl.setRoot(ScanSessionsPage);
  }

  onSlideChanged() {
    this.showNext = !this.slider.isEnd();
    if (this.slider.isEnd()) {
      this.scheduleShowTroubleshootingDialog();
      this.utils.askWiFiEnableIfDisabled();
    }
  }

  getWebSiteName() {
    return Config.WEBSITE_NAME;
  }

  attempConnection(server: ServerModel) {
    if (this.connecting) {
      this.slider.slideTo(this.slider.length() - 1);
      this.currentAttemptingServer = server;
      this.serverProvider.connect(server)
      this.scheduleShowTroubleshootingDialog();
    }
  }

  scheduleShowTroubleshootingDialog() {
    if (this.troubleshootingDialogTimeout) clearTimeout(this.troubleshootingDialogTimeout);

    this.troubleshootingDialogTimeout = setTimeout(() => {
      if (this.connecting) {
        let alert = this.alertCtrl.create({
          title: 'The connection is taking too long',
          message: 'Your firewall/antivirus may keep the app from connecting, would you like to see the instructions to configure your computer?',
          buttons: [
            {
              text: 'Cancel',
              role: 'cancel',
              handler: () => { }
            },
            {
              text: 'View instructions',
              handler: () => {
                window.open(Config.URL_INSTRUCTIONS, '_blank');
              }
            }
          ]
        });
        alert.present();
      }
    }, 1000 * 25) // 25 secs
  }
}
