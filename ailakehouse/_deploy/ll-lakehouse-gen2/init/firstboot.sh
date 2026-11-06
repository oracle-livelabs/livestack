#!/bin/bash


#########LIVELABS ##########
## set hostname
sudo sed -i -r 's/^PRESERVE_HOSTINFO=.*/PRESERVE_HOSTINFO=2/' /etc/oci-hostname.conf
sudo hostnamectl set-hostname holserv1.livelabs.oraclevcn.com
echo "$(oci-metadata -g privateIp | sed -n -e 's/^.*Private IP address: //p') holserv1.livelabs.oraclevcn.com holserv1" | sudo tee -a /etc/hosts
#fix /etc/hosts (remove original hostname - it is always the 3rd entry in a vanilla install)
sudo sed -i '3d' /etc/hosts

